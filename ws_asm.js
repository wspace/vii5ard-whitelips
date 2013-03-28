var  asm  = (function() {
  var mnemo = (function () {
    var mnemo = {};
     for (var i in ws.keywords) {
       var keyword = ws.keywords[i];
       mnemo[keyword.mnemo] = keyword;
     }
    return mnemo;
  })(); 

  var StrArr = function(str) {
    return {
      arr: str.split(''),
      pos: 0,
      line: 1,
      col: 1,
      hasNext: function  () {
        return this.pos  < this.arr.length;
      },
      getNext: function  () {
        var next = this.arr[this.pos++];
        if (next == '\n') {
          this.line++;
          this.col = 1;
        } else {
          this.col++;
        }
        return next;
      },
      peek:  function ()  {
        return this.arr[this.pos];
      }
    };
  };

  var parseWhitespace = function  (strArr) {
    var  space =  "";
    while (strArr.hasNext()  && strArr.peek().match(/[ \t\n\r]/)) {
      space  += strArr.getNext();
    }
    return {
      type: "SPACE",
      token: space
    };
  };

  var parseLineComment = function (strArr) {
    var  comment  = "";
    do {
      comment += strArr.getNext();
    } while  (strArr.hasNext() && strArr.peek() != '\n');
    return {
      type: "COMMENT",
      token: comment
    };
  };

  var parseNumber = function(strArr) {
    var  numStr = "";
    while  (strArr.hasNext() && (numStr + strArr.peek()).match(/^[+-]?\d*$/)) {
      numStr +=  strArr.getNext();
    }

    if (strArr.hasNext() && !strArr.peek().match(/\s|\n|;/)) {
      throw "Illegal character at" + strArr.line + ":" + strArr.col;
    }
    var data = parseInt(numStr);
    if (data == "NaN") {
      throw "Illegal number at" + strArr.line + ":" + strArr.col;
    }
    return {
      type: "NUMBER",
      token: numStr,
      data: parseInt(numStr)
    }
  };

  var getStringArray = function(str) {
    var arr = str.split('');
    var result = [];
    var escape = false;
    var chCode = "";
    for (var i = 1; i < arr.length - 1 ; i++) {
       var ch = arr[i];
       if (chCode) {
         if (ch.match(/[0-9]/)) {
           chCode += ch;
           continue;
         } else {
           result.push(parseInt(chCode));
           chCode = "";
         }
       }
       if (escape) {
          if (ch == 'n') {
            result.push('\n'.charCodeAt(0));
          } else if (ch == 't') {
            result.push('\t'.charCodeAt(0));
          } else if (ch.match(/[0-9]/)) {
            chCode += ch;
          } else {
            result.push(ch.charCodeAt(0));
          }
          escape = false;
       } else if (ch == '\\') {
         escape = true;
       } else {
         result.push(ch.charCodeAt(0));
       }
    }
    if (chCode) {
      result.push(parseInt(chCode));
    }
    if (arr[0] == '"') {
       result.push(0);
    }
    return result;
  }

  var parseString = function(strArr) {
     var line = strArr.line;
     var col = strArr.col;

     var strEnd = strArr.peek();
     var str = strArr.getNext();
     while (strArr.hasNext() && (escape || strArr.peek() != strEnd)) {
       if (strArr.peek() == '\\') {
         escape = true;
       } else {
         escape = false;
       }
       str += strArr.getNext();
     }
     if (!strArr.hasNext || strArr.peek() != strEnd) {
        throw "Unterminated string at" + line + ":" + col;
     } else {
       str += strArr.getNext();
     }
     return {
       type: "STRING",
       token: str
     };
  }

  var parseLabel = function(strArr) {
    var  label = "";
    while  (strArr.hasNext() && strArr.peek().match(/[0-9a-zA-Z_$.]/)) {
      label +=  strArr.getNext();
    }

    var type = "TOKEN";
    if (strArr.hasNext()) {
      var next = strArr.peek();
      if(!next.match(/\s|\n|:|;/)) {
        throw "Illegal character at" + strArr.line + ":" + strArr.col;
      } else if (next == ':') {
         strArr.getNext();
         type = "LABEL";
      } 
    }

    var op = mnemo[label];
    if (op) {
       type = "KEYWORD";
    }
    return {
      type: type,
      token: label,
      op: op
    };

  };

  $(function () {
    // asm.parseInput();
  });

  var stopCount = 100;

  var getTokens = function(strArr) {
    var tokens = [];
    while (strArr.hasNext()) {
      if (!stopCount--) {
         break;
      }
      if (parseWhitespace(strArr).token) {
        continue;
      }
      var meta = {
        line: strArr.line,
        col: strArr.col
      };

      var next = strArr.peek();
      var token = null;
      if (next == ';') {
        token = parseLineComment(strArr);
      } else if (next.match(/\"|\'/)) {
        token = parseString(strArr);
      } else if (next.match(/[+-\d]/)) {
        token = parseNumber(strArr);
      } else {
        token = parseLabel(strArr);
      }

      token.meta = meta;

      if (token.type == "STRING") {
        console.log("String: " + getStringArray(token.token));
        token.data = getStringArray(token.token);
      }
      if (token.type != "COMMENT") {
        console.log("Token: [" + token.type + ":'" + token.token + "']");
        tokens.push(token);
      }
    }
    return tokens;
  }  

  var pushInstruction = function(builder, constr, paramNumber) {
    var instruction = new constr();
    if (typeof paramNumber != "undefined" && paramNumber != null) {
      instruction.param = { token: ws_util.getWsSignedNumber(paramNumber), value: paramNumber };
    }
    builder.pushInstruction(instruction);
  }

  return {
    compile: function (str) {
       var strArr = new StrArr(str);
       var tokens = getTokens(strArr);
       var builder = ws.programBuilder(str);
       var tokenNr = 0;
       var labeler = new ws_util.labelTransformer(ws_util.getWsUnsignedNumber);
       while (tokenNr < tokens.length) {
          var token = tokens[tokenNr++];
          var meta = token.meta;
          if (token.type == "LABEL") {
            builder.labels[labeler.getLabel(token.token)] = builder.programStack.length;
          } else if (token.type == "KEYWORD") {
             var op = token.op;
             var instruction = new op.constr();
             if (op.param) {
               var param = tokens[tokenNr++];
               if (!param) {
                 throw "Parameter expected at line + " + token.line + ".";
               }
               if (op.param == "NUMBER") {
                 if (param.type == "NUMBER") {
                   pushInstruction(builder, op.constr, param.data);
                 } else if (param.type == "STRING") {
                   for (var i = param.data.length -1 ; i >= 0; i--) {
                     pushInstruction(builder, op.constr, param.data[i]);
                   }
                 }
               } else if (op.param == "LABEL") {
                 var instruction = new op.constr();
                 instruction.param = {token: labeler.getLabel(param.token), value: null };
                 builder.pushInstruction(instruction); 
               } else {
                 throw "Unsupported parameter type " + op.param + " (should never happen).";
               }
             } else {
               pushInstruction(builder, op.constr);
             }
          } else {
             throw "Unexpected token at line " + meta.line + ":" + meta.col + ".";
          }
       }
       builder.postProcess();

    for (label in builder.labels) {
      var inst = builder.programStack[builder.labels[label]];
      if (!inst.labels) inst.labels = [];
      inst.labels.push(label);
    }


       console.log(builder.getAsmSrc());
       return builder;
    },
    parseInput: function () {
      var src = $('#asmArea').val();
      return asm.compile(src);
    }
  };

})();
