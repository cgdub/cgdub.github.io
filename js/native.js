// The Module object: Our interface to the outside world. We import
// and export values on it, and do the work to get that through
// closure compiler if necessary. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to do an eval in order to handle the closure compiler
// case, where this code here is minified but Module was defined
// elsewhere (e.g. case 4 above). We also need to check if Module
// already exists (e.g. case 3 above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module;
if (!Module) Module = (typeof Module !== 'undefined' ? Module : null) || {};

// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {};
for (var key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}

// The environment setup code below is customized to use Module.
// *** Environment setup code ***
var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;

// Three configurations we can be running in:
// 1) We could be the application main() thread running in the main JS UI thread. (ENVIRONMENT_IS_WORKER == false and ENVIRONMENT_IS_PTHREAD == false)
// 2) We could be the application main() thread proxied to worker. (with Emscripten -s PROXY_TO_WORKER=1) (ENVIRONMENT_IS_WORKER == true, ENVIRONMENT_IS_PTHREAD == false)
// 3) We could be an application pthread running in a worker. (ENVIRONMENT_IS_WORKER == true and ENVIRONMENT_IS_PTHREAD == true)

if (Module['ENVIRONMENT']) {
  if (Module['ENVIRONMENT'] === 'WEB') {
    ENVIRONMENT_IS_WEB = true;
  } else if (Module['ENVIRONMENT'] === 'WORKER') {
    ENVIRONMENT_IS_WORKER = true;
  } else if (Module['ENVIRONMENT'] === 'NODE') {
    ENVIRONMENT_IS_NODE = true;
  } else if (Module['ENVIRONMENT'] === 'SHELL') {
    ENVIRONMENT_IS_SHELL = true;
  } else {
    throw new Error('The provided Module[\'ENVIRONMENT\'] value is not valid. It must be one of: WEB|WORKER|NODE|SHELL.');
  }
} else {
  ENVIRONMENT_IS_WEB = typeof window === 'object';
  ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
  ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function' && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
  ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
}


if (ENVIRONMENT_IS_NODE) {
  // Expose functionality in the same simple way that the shells work
  // Note that we pollute the global namespace here, otherwise we break in node
  if (!Module['print']) Module['print'] = console.log;
  if (!Module['printErr']) Module['printErr'] = console.warn;

  var nodeFS;
  var nodePath;

  Module['read'] = function read(filename, binary) {
    if (!nodeFS) nodeFS = require('fs');
    if (!nodePath) nodePath = require('path');
    filename = nodePath['normalize'](filename);
    var ret = nodeFS['readFileSync'](filename);
    return binary ? ret : ret.toString();
  };

  Module['readBinary'] = function readBinary(filename) {
    var ret = Module['read'](filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    assert(ret.buffer);
    return ret;
  };

  Module['load'] = function load(f) {
    globalEval(read(f));
  };

  if (!Module['thisProgram']) {
    if (process['argv'].length > 1) {
      Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
    } else {
      Module['thisProgram'] = 'unknown-program';
    }
  }

  Module['arguments'] = process['argv'].slice(2);

  if (typeof module !== 'undefined') {
    module['exports'] = Module;
  }

  process['on']('uncaughtException', function(ex) {
    // suppress ExitStatus exceptions from showing an error
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });

  Module['inspect'] = function () { return '[Emscripten Module object]'; };
}
else if (ENVIRONMENT_IS_SHELL) {
  if (!Module['print']) Module['print'] = print;
  if (typeof printErr != 'undefined') Module['printErr'] = printErr; // not present in v8 or older sm

  if (typeof read != 'undefined') {
    Module['read'] = read;
  } else {
    Module['read'] = function read() { throw 'no read() available' };
  }

  Module['readBinary'] = function readBinary(f) {
    if (typeof readbuffer === 'function') {
      return new Uint8Array(readbuffer(f));
    }
    var data = read(f, 'binary');
    assert(typeof data === 'object');
    return data;
  };

  if (typeof scriptArgs != 'undefined') {
    Module['arguments'] = scriptArgs;
  } else if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof quit === 'function') {
    Module['quit'] = function(status, toThrow) {
      quit(status);
    }
  }

}
else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  Module['read'] = function read(url) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.send(null);
    return xhr.responseText;
  };

  if (ENVIRONMENT_IS_WORKER) {
    Module['readBinary'] = function read(url) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.responseType = 'arraybuffer';
      xhr.send(null);
      return xhr.response;
    };
  }

  Module['readAsync'] = function readAsync(url, onload, onerror) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function xhr_onload() {
      if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
        onload(xhr.response);
      } else {
        onerror();
      }
    };
    xhr.onerror = onerror;
    xhr.send(null);
  };

  if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof console !== 'undefined') {
    if (!Module['print']) Module['print'] = function print(x) {
      console.log(x);
    };
    if (!Module['printErr']) Module['printErr'] = function printErr(x) {
      console.warn(x);
    };
  } else {
    // Probably a worker, and without console.log. We can do very little here...
    var TRY_USE_DUMP = false;
    if (!Module['print']) Module['print'] = (TRY_USE_DUMP && (typeof(dump) !== "undefined") ? (function(x) {
      dump(x);
    }) : (function(x) {
      // self.postMessage(x); // enable this if you want stdout to be sent as messages
    }));
  }

  if (ENVIRONMENT_IS_WORKER) {
    Module['load'] = importScripts;
  }

  if (typeof Module['setWindowTitle'] === 'undefined') {
    Module['setWindowTitle'] = function(title) { document.title = title };
  }
}
else {
  // Unreachable because SHELL is dependant on the others
  throw 'Unknown runtime environment. Where are we?';
}

function globalEval(x) {
  eval.call(null, x);
}
if (!Module['load'] && Module['read']) {
  Module['load'] = function load(f) {
    globalEval(Module['read'](f));
  };
}
if (!Module['print']) {
  Module['print'] = function(){};
}
if (!Module['printErr']) {
  Module['printErr'] = Module['print'];
}
if (!Module['arguments']) {
  Module['arguments'] = [];
}
if (!Module['thisProgram']) {
  Module['thisProgram'] = './this.program';
}
if (!Module['quit']) {
  Module['quit'] = function(status, toThrow) {
    throw toThrow;
  }
}

// *** Environment setup code ***

// Closure helpers
Module.print = Module['print'];
Module.printErr = Module['printErr'];

// Callbacks
Module['preRun'] = [];
Module['postRun'] = [];

// Merge back in the overrides
for (var key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = undefined;



// {{PREAMBLE_ADDITIONS}}

// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

//========================================
// Runtime code shared with compiler
//========================================

var Runtime = {
  setTempRet0: function (value) {
    tempRet0 = value;
    return value;
  },
  getTempRet0: function () {
    return tempRet0;
  },
  stackSave: function () {
    return STACKTOP;
  },
  stackRestore: function (stackTop) {
    STACKTOP = stackTop;
  },
  getNativeTypeSize: function (type) {
    switch (type) {
      case 'i1': case 'i8': return 1;
      case 'i16': return 2;
      case 'i32': return 4;
      case 'i64': return 8;
      case 'float': return 4;
      case 'double': return 8;
      default: {
        if (type[type.length-1] === '*') {
          return Runtime.QUANTUM_SIZE; // A pointer
        } else if (type[0] === 'i') {
          var bits = parseInt(type.substr(1));
          assert(bits % 8 === 0);
          return bits/8;
        } else {
          return 0;
        }
      }
    }
  },
  getNativeFieldSize: function (type) {
    return Math.max(Runtime.getNativeTypeSize(type), Runtime.QUANTUM_SIZE);
  },
  STACK_ALIGN: 16,
  prepVararg: function (ptr, type) {
    if (type === 'double' || type === 'i64') {
      // move so the load is aligned
      if (ptr & 7) {
        assert((ptr & 7) === 4);
        ptr += 4;
      }
    } else {
      assert((ptr & 3) === 0);
    }
    return ptr;
  },
  getAlignSize: function (type, size, vararg) {
    // we align i64s and doubles on 64-bit boundaries, unlike x86
    if (!vararg && (type == 'i64' || type == 'double')) return 8;
    if (!type) return Math.min(size, 8); // align structures internally to 64 bits
    return Math.min(size || (type ? Runtime.getNativeFieldSize(type) : 0), Runtime.QUANTUM_SIZE);
  },
  dynCall: function (sig, ptr, args) {
    if (args && args.length) {
      assert(args.length == sig.length-1);
      assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
      return Module['dynCall_' + sig].apply(null, [ptr].concat(args));
    } else {
      assert(sig.length == 1);
      assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
      return Module['dynCall_' + sig].call(null, ptr);
    }
  },
  functionPointers: [],
  addFunction: function (func) {
    for (var i = 0; i < Runtime.functionPointers.length; i++) {
      if (!Runtime.functionPointers[i]) {
        Runtime.functionPointers[i] = func;
        return 2*(1 + i);
      }
    }
    throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';
  },
  removeFunction: function (index) {
    Runtime.functionPointers[(index-2)/2] = null;
  },
  warnOnce: function (text) {
    if (!Runtime.warnOnce.shown) Runtime.warnOnce.shown = {};
    if (!Runtime.warnOnce.shown[text]) {
      Runtime.warnOnce.shown[text] = 1;
      Module.printErr(text);
    }
  },
  funcWrappers: {},
  getFuncWrapper: function (func, sig) {
    assert(sig);
    if (!Runtime.funcWrappers[sig]) {
      Runtime.funcWrappers[sig] = {};
    }
    var sigCache = Runtime.funcWrappers[sig];
    if (!sigCache[func]) {
      // optimize away arguments usage in common cases
      if (sig.length === 1) {
        sigCache[func] = function dynCall_wrapper() {
          return Runtime.dynCall(sig, func);
        };
      } else if (sig.length === 2) {
        sigCache[func] = function dynCall_wrapper(arg) {
          return Runtime.dynCall(sig, func, [arg]);
        };
      } else {
        // general case
        sigCache[func] = function dynCall_wrapper() {
          return Runtime.dynCall(sig, func, Array.prototype.slice.call(arguments));
        };
      }
    }
    return sigCache[func];
  },
  getCompilerSetting: function (name) {
    throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for Runtime.getCompilerSetting or emscripten_get_compiler_setting to work';
  },
  stackAlloc: function (size) { var ret = STACKTOP;STACKTOP = (STACKTOP + size)|0;STACKTOP = (((STACKTOP)+15)&-16);(assert((((STACKTOP|0) < (STACK_MAX|0))|0))|0); return ret; },
  staticAlloc: function (size) { var ret = STATICTOP;STATICTOP = (STATICTOP + (assert(!staticSealed),size))|0;STATICTOP = (((STATICTOP)+15)&-16); return ret; },
  dynamicAlloc: function (size) { assert(DYNAMICTOP_PTR);var ret = HEAP32[DYNAMICTOP_PTR>>2];var end = (((ret + size + 15)|0) & -16);HEAP32[DYNAMICTOP_PTR>>2] = end;if (end >= TOTAL_MEMORY) {var success = enlargeMemory();if (!success) {HEAP32[DYNAMICTOP_PTR>>2] = ret;return 0;}}return ret;},
  alignMemory: function (size,quantum) { var ret = size = Math.ceil((size)/(quantum ? quantum : 16))*(quantum ? quantum : 16); return ret; },
  makeBigInt: function (low,high,unsigned) { var ret = (unsigned ? ((+((low>>>0)))+((+((high>>>0)))*4294967296.0)) : ((+((low>>>0)))+((+((high|0)))*4294967296.0))); return ret; },
  GLOBAL_BASE: 8,
  QUANTUM_SIZE: 4,
  __dummy__: 0
}



Module["Runtime"] = Runtime;



//========================================
// Runtime essentials
//========================================

var ABORT = 0; // whether we are quitting the application. no code should run after this. set in exit() and abort()
var EXITSTATUS = 0;

function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}

var globalScope = this;

// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  var func = Module['_' + ident]; // closure exported function
  if (!func) {
    try { func = eval('_' + ident); } catch(e) {}
  }
  assert(func, 'Cannot call unknown function ' + ident + ' (perhaps LLVM optimizations or closure removed it?)');
  return func;
}

var cwrap, ccall;
(function(){
  var JSfuncs = {
    // Helpers for cwrap -- it can't refer to Runtime directly because it might
    // be renamed by closure, instead it calls JSfuncs['stackSave'].body to find
    // out what the minified function name is.
    'stackSave': function() {
      Runtime.stackSave()
    },
    'stackRestore': function() {
      Runtime.stackRestore()
    },
    // type conversion from js to c
    'arrayToC' : function(arr) {
      var ret = Runtime.stackAlloc(arr.length);
      writeArrayToMemory(arr, ret);
      return ret;
    },
    'stringToC' : function(str) {
      var ret = 0;
      if (str !== null && str !== undefined && str !== 0) { // null string
        // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
        var len = (str.length << 2) + 1;
        ret = Runtime.stackAlloc(len);
        stringToUTF8(str, ret, len);
      }
      return ret;
    }
  };
  // For fast lookup of conversion functions
  var toC = {'string' : JSfuncs['stringToC'], 'array' : JSfuncs['arrayToC']};

  // C calling interface.
  ccall = function ccallFunc(ident, returnType, argTypes, args, opts) {
    var func = getCFunc(ident);
    var cArgs = [];
    var stack = 0;
    assert(returnType !== 'array', 'Return type should not be "array".');
    if (args) {
      for (var i = 0; i < args.length; i++) {
        var converter = toC[argTypes[i]];
        if (converter) {
          if (stack === 0) stack = Runtime.stackSave();
          cArgs[i] = converter(args[i]);
        } else {
          cArgs[i] = args[i];
        }
      }
    }
    var ret = func.apply(null, cArgs);
    if ((!opts || !opts.async) && typeof EmterpreterAsync === 'object') {
      assert(!EmterpreterAsync.state, 'cannot start async op with normal JS calling ccall');
    }
    if (opts && opts.async) assert(!returnType, 'async ccalls cannot return values');
    if (returnType === 'string') ret = Pointer_stringify(ret);
    if (stack !== 0) {
      if (opts && opts.async) {
        EmterpreterAsync.asyncFinalizers.push(function() {
          Runtime.stackRestore(stack);
        });
        return;
      }
      Runtime.stackRestore(stack);
    }
    return ret;
  }

  var sourceRegex = /^function\s*[a-zA-Z$_0-9]*\s*\(([^)]*)\)\s*{\s*([^*]*?)[\s;]*(?:return\s*(.*?)[;\s]*)?}$/;
  function parseJSFunc(jsfunc) {
    // Match the body and the return value of a javascript function source
    var parsed = jsfunc.toString().match(sourceRegex).slice(1);
    return {arguments : parsed[0], body : parsed[1], returnValue: parsed[2]}
  }

  // sources of useful functions. we create this lazily as it can trigger a source decompression on this entire file
  var JSsource = null;
  function ensureJSsource() {
    if (!JSsource) {
      JSsource = {};
      for (var fun in JSfuncs) {
        if (JSfuncs.hasOwnProperty(fun)) {
          // Elements of toCsource are arrays of three items:
          // the code, and the return value
          JSsource[fun] = parseJSFunc(JSfuncs[fun]);
        }
      }
    }
  }

  cwrap = function cwrap(ident, returnType, argTypes) {
    argTypes = argTypes || [];
    var cfunc = getCFunc(ident);
    // When the function takes numbers and returns a number, we can just return
    // the original function
    var numericArgs = argTypes.every(function(type){ return type === 'number'});
    var numericRet = (returnType !== 'string');
    if ( numericRet && numericArgs) {
      return cfunc;
    }
    // Creation of the arguments list (["$1","$2",...,"$nargs"])
    var argNames = argTypes.map(function(x,i){return '$'+i});
    var funcstr = "(function(" + argNames.join(',') + ") {";
    var nargs = argTypes.length;
    if (!numericArgs) {
      // Generate the code needed to convert the arguments from javascript
      // values to pointers
      ensureJSsource();
      funcstr += 'var stack = ' + JSsource['stackSave'].body + ';';
      for (var i = 0; i < nargs; i++) {
        var arg = argNames[i], type = argTypes[i];
        if (type === 'number') continue;
        var convertCode = JSsource[type + 'ToC']; // [code, return]
        funcstr += 'var ' + convertCode.arguments + ' = ' + arg + ';';
        funcstr += convertCode.body + ';';
        funcstr += arg + '=(' + convertCode.returnValue + ');';
      }
    }

    // When the code is compressed, the name of cfunc is not literally 'cfunc' anymore
    var cfuncname = parseJSFunc(function(){return cfunc}).returnValue;
    // Call the function
    funcstr += 'var ret = ' + cfuncname + '(' + argNames.join(',') + ');';
    if (!numericRet) { // Return type can only by 'string' or 'number'
      // Convert the result to a string
      var strgfy = parseJSFunc(function(){return Pointer_stringify}).returnValue;
      funcstr += 'ret = ' + strgfy + '(ret);';
    }
    funcstr += "if (typeof EmterpreterAsync === 'object') { assert(!EmterpreterAsync.state, 'cannot start async op with normal JS calling cwrap') }";
    if (!numericArgs) {
      // If we had a stack, restore it
      ensureJSsource();
      funcstr += JSsource['stackRestore'].body.replace('()', '(stack)') + ';';
    }
    funcstr += 'return ret})';
    return eval(funcstr);
  };
})();
Module["ccall"] = ccall;
Module["cwrap"] = cwrap;

function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': HEAP8[((ptr)>>0)]=value; break;
      case 'i8': HEAP8[((ptr)>>0)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math_min((+(Math_floor((tempDouble)/4294967296.0))), 4294967295.0))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': HEAPF64[((ptr)>>3)]=value; break;
      default: abort('invalid type for setValue: ' + type);
    }
}
Module["setValue"] = setValue;


function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': return HEAP8[((ptr)>>0)];
      case 'i8': return HEAP8[((ptr)>>0)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: abort('invalid type for setValue: ' + type);
    }
  return null;
}
Module["getValue"] = getValue;

var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_STATIC = 2; // Cannot be freed
var ALLOC_DYNAMIC = 3; // Cannot be freed except through sbrk
var ALLOC_NONE = 4; // Do not allocate
Module["ALLOC_NORMAL"] = ALLOC_NORMAL;
Module["ALLOC_STACK"] = ALLOC_STACK;
Module["ALLOC_STATIC"] = ALLOC_STATIC;
Module["ALLOC_DYNAMIC"] = ALLOC_DYNAMIC;
Module["ALLOC_NONE"] = ALLOC_NONE;

// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data, or a number. If a number, then the size of the block to allocate,
//        in *bytes* (note that this is sometimes confusing: the next parameter does not
//        affect this!)
// @types: Either an array of types, one for each byte (or 0 if no type at that position),
//         or a single type which is used for the entire block. This only matters if there
//         is initial data - if @slab is a number, then this does not matter at all and is
//         ignored.
// @allocator: How to allocate memory, see ALLOC_*
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }

  var singleType = typeof types === 'string' ? types : null;

  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [typeof _malloc === 'function' ? _malloc : Runtime.staticAlloc, Runtime.stackAlloc, Runtime.staticAlloc, Runtime.dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length));
  }

  if (zeroinit) {
    var ptr = ret, stop;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[((ptr)>>2)]=0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[((ptr++)>>0)]=0;
    }
    return ret;
  }

  if (singleType === 'i8') {
    if (slab.subarray || slab.slice) {
      HEAPU8.set(slab, ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }

  var i = 0, type, typeSize, previousType;
  while (i < size) {
    var curr = slab[i];

    if (typeof curr === 'function') {
      curr = Runtime.getFunctionIndex(curr);
    }

    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }
    assert(type, 'Must know what type to store in allocate!');

    if (type == 'i64') type = 'i32'; // special case: we have one i32 here, and one i32 later

    setValue(ret+i, curr, type);

    // no need to look up size unless type changes, so cache it
    if (previousType !== type) {
      typeSize = Runtime.getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }

  return ret;
}
Module["allocate"] = allocate;

// Allocate memory during any stage of startup - static memory early on, dynamic memory later, malloc when ready
function getMemory(size) {
  if (!staticSealed) return Runtime.staticAlloc(size);
  if (!runtimeInitialized) return Runtime.dynamicAlloc(size);
  return _malloc(size);
}
Module["getMemory"] = getMemory;

function Pointer_stringify(ptr, /* optional */ length) {
  if (length === 0 || !ptr) return '';
  // TODO: use TextDecoder
  // Find the length, and check for UTF while doing so
  var hasUtf = 0;
  var t;
  var i = 0;
  while (1) {
    assert(ptr + i < TOTAL_MEMORY);
    t = HEAPU8[(((ptr)+(i))>>0)];
    hasUtf |= t;
    if (t == 0 && !length) break;
    i++;
    if (length && i == length) break;
  }
  if (!length) length = i;

  var ret = '';

  if (hasUtf < 128) {
    var MAX_CHUNK = 1024; // split up into chunks, because .apply on a huge string can overflow the stack
    var curr;
    while (length > 0) {
      curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
      ret = ret ? ret + curr : curr;
      ptr += MAX_CHUNK;
      length -= MAX_CHUNK;
    }
    return ret;
  }
  return Module['UTF8ToString'](ptr);
}
Module["Pointer_stringify"] = Pointer_stringify;

// Given a pointer 'ptr' to a null-terminated ASCII-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function AsciiToString(ptr) {
  var str = '';
  while (1) {
    var ch = HEAP8[((ptr++)>>0)];
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}
Module["AsciiToString"] = AsciiToString;

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}
Module["stringToAscii"] = stringToAscii;

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

var UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;
function UTF8ArrayToString(u8Array, idx) {
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  while (u8Array[endPtr]) ++endPtr;

  if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
    return UTF8Decoder.decode(u8Array.subarray(idx, endPtr));
  } else {
    var u0, u1, u2, u3, u4, u5;

    var str = '';
    while (1) {
      // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
      u0 = u8Array[idx++];
      if (!u0) return str;
      if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
      u1 = u8Array[idx++] & 63;
      if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
      u2 = u8Array[idx++] & 63;
      if ((u0 & 0xF0) == 0xE0) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        u3 = u8Array[idx++] & 63;
        if ((u0 & 0xF8) == 0xF0) {
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | u3;
        } else {
          u4 = u8Array[idx++] & 63;
          if ((u0 & 0xFC) == 0xF8) {
            u0 = ((u0 & 3) << 24) | (u1 << 18) | (u2 << 12) | (u3 << 6) | u4;
          } else {
            u5 = u8Array[idx++] & 63;
            u0 = ((u0 & 1) << 30) | (u1 << 24) | (u2 << 18) | (u3 << 12) | (u4 << 6) | u5;
          }
        }
      }
      if (u0 < 0x10000) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 0x10000;
        str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
      }
    }
  }
}
Module["UTF8ArrayToString"] = UTF8ArrayToString;

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF8ToString(ptr) {
  return UTF8ArrayToString(HEAPU8,ptr);
}
Module["UTF8ToString"] = UTF8ToString;

// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outU8Array: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      outU8Array[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      outU8Array[outIdx++] = 0xC0 | (u >> 6);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      outU8Array[outIdx++] = 0xE0 | (u >> 12);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x1FFFFF) {
      if (outIdx + 3 >= endIdx) break;
      outU8Array[outIdx++] = 0xF0 | (u >> 18);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x3FFFFFF) {
      if (outIdx + 4 >= endIdx) break;
      outU8Array[outIdx++] = 0xF8 | (u >> 24);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 5 >= endIdx) break;
      outU8Array[outIdx++] = 0xFC | (u >> 30);
      outU8Array[outIdx++] = 0x80 | ((u >> 24) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  outU8Array[outIdx] = 0;
  return outIdx - startIdx;
}
Module["stringToUTF8Array"] = stringToUTF8Array;

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}
Module["stringToUTF8"] = stringToUTF8;

// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      ++len;
    } else if (u <= 0x7FF) {
      len += 2;
    } else if (u <= 0xFFFF) {
      len += 3;
    } else if (u <= 0x1FFFFF) {
      len += 4;
    } else if (u <= 0x3FFFFFF) {
      len += 5;
    } else {
      len += 6;
    }
  }
  return len;
}
Module["lengthBytesUTF8"] = lengthBytesUTF8;

// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

var UTF16Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : undefined;
function UTF16ToString(ptr) {
  assert(ptr % 2 == 0, 'Pointer passed to UTF16ToString must be aligned to two bytes!');
  var endPtr = ptr;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  var idx = endPtr >> 1;
  while (HEAP16[idx]) ++idx;
  endPtr = idx << 1;

  if (endPtr - ptr > 32 && UTF16Decoder) {
    return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
  } else {
    var i = 0;

    var str = '';
    while (1) {
      var codeUnit = HEAP16[(((ptr)+(i*2))>>1)];
      if (codeUnit == 0) return str;
      ++i;
      // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
      str += String.fromCharCode(codeUnit);
    }
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF16 form. The copy will require at most str.length*4+2 bytes of space in the HEAP.
// Use the function lengthBytesUTF16() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=2, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<2 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF16(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 2 == 0, 'Pointer passed to stringToUTF16 must be aligned to two bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 2) return 0;
  maxBytesToWrite -= 2; // Null terminator.
  var startPtr = outPtr;
  var numCharsToWrite = (maxBytesToWrite < str.length*2) ? (maxBytesToWrite / 2) : str.length;
  for (var i = 0; i < numCharsToWrite; ++i) {
    // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    HEAP16[((outPtr)>>1)]=codeUnit;
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP16[((outPtr)>>1)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length*2;
}


function UTF32ToString(ptr) {
  assert(ptr % 4 == 0, 'Pointer passed to UTF32ToString must be aligned to four bytes!');
  var i = 0;

  var str = '';
  while (1) {
    var utf32 = HEAP32[(((ptr)+(i*4))>>2)];
    if (utf32 == 0)
      return str;
    ++i;
    // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    if (utf32 >= 0x10000) {
      var ch = utf32 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF32 form. The copy will require at most str.length*4+4 bytes of space in the HEAP.
// Use the function lengthBytesUTF32() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=4, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<4 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF32(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 4 == 0, 'Pointer passed to stringToUTF32 must be aligned to four bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF32(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 4) return 0;
  var startPtr = outPtr;
  var endPtr = startPtr + maxBytesToWrite - 4;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) {
      var trailSurrogate = str.charCodeAt(++i);
      codeUnit = 0x10000 + ((codeUnit & 0x3FF) << 10) | (trailSurrogate & 0x3FF);
    }
    HEAP32[((outPtr)>>2)]=codeUnit;
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP32[((outPtr)>>2)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF32(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) ++i; // possibly a lead surrogate, so skip over the tail surrogate.
    len += 4;
  }

  return len;
}


function demangle(func) {
  var __cxa_demangle_func = Module['___cxa_demangle'] || Module['__cxa_demangle'];
  if (__cxa_demangle_func) {
    try {
      var s =
        func.substr(1);
      var len = lengthBytesUTF8(s)+1;
      var buf = _malloc(len);
      stringToUTF8(s, buf, len);
      var status = _malloc(4);
      var ret = __cxa_demangle_func(buf, 0, 0, status);
      if (getValue(status, 'i32') === 0 && ret) {
        return Pointer_stringify(ret);
      }
      // otherwise, libcxxabi failed
    } catch(e) {
      // ignore problems here
    } finally {
      if (buf) _free(buf);
      if (status) _free(status);
      if (ret) _free(ret);
    }
    // failure when using libcxxabi, don't demangle
    return func;
  }
  Runtime.warnOnce('warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling');
  return func;
}

function demangleAll(text) {
  var regex =
    /__Z[\w\d_]+/g;
  return text.replace(regex,
    function(x) {
      var y = demangle(x);
      return x === y ? x : (x + ' [' + y + ']');
    });
}

function jsStackTrace() {
  var err = new Error();
  if (!err.stack) {
    // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
    // so try that as a special-case.
    try {
      throw new Error(0);
    } catch(e) {
      err = e;
    }
    if (!err.stack) {
      return '(no stack trace available)';
    }
  }
  return err.stack.toString();
}

function stackTrace() {
  var js = jsStackTrace();
  if (Module['extraStackTrace']) js += '\n' + Module['extraStackTrace']();
  return demangleAll(js);
}
Module["stackTrace"] = stackTrace;

// Memory management

var PAGE_SIZE = 16384;
var WASM_PAGE_SIZE = 65536;
var ASMJS_PAGE_SIZE = 16777216;
var MIN_TOTAL_MEMORY = 16777216;

function alignUp(x, multiple) {
  if (x % multiple > 0) {
    x += multiple - (x % multiple);
  }
  return x;
}

var HEAP;
var buffer;
var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;

function updateGlobalBuffer(buf) {
  Module['buffer'] = buffer = buf;
}

function updateGlobalBufferViews() {
  Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
  Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
  Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
}

var STATIC_BASE, STATICTOP, staticSealed; // static area
var STACK_BASE, STACKTOP, STACK_MAX; // stack area
var DYNAMIC_BASE, DYNAMICTOP_PTR; // dynamic area handled by sbrk

  STATIC_BASE = STATICTOP = STACK_BASE = STACKTOP = STACK_MAX = DYNAMIC_BASE = DYNAMICTOP_PTR = 0;
  staticSealed = false;


// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  assert((STACK_MAX & 3) == 0);
  HEAPU32[(STACK_MAX >> 2)-1] = 0x02135467;
  HEAPU32[(STACK_MAX >> 2)-2] = 0x89BACDFE;
}

function checkStackCookie() {
  if (HEAPU32[(STACK_MAX >> 2)-1] != 0x02135467 || HEAPU32[(STACK_MAX >> 2)-2] != 0x89BACDFE) {
    abort('Stack overflow! Stack cookie has been overwritten, expected hex dwords 0x89BACDFE and 0x02135467, but received 0x' + HEAPU32[(STACK_MAX >> 2)-2].toString(16) + ' ' + HEAPU32[(STACK_MAX >> 2)-1].toString(16));
  }
  // Also test the global address 0 for integrity. This check is not compatible with SAFE_SPLIT_MEMORY though, since that mode already tests all address 0 accesses on its own.
  if (HEAP32[0] !== 0x63736d65 /* 'emsc' */) throw 'Runtime error: The application has corrupted its heap memory area (address zero)!';
}

function abortStackOverflow(allocSize) {
  abort('Stack overflow! Attempted to allocate ' + allocSize + ' bytes on the stack, but stack has only ' + (STACK_MAX - asm.stackSave() + allocSize) + ' bytes available!');
}

function abortOnCannotGrowMemory() {
  abort('Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' + TOTAL_MEMORY + ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which adjusts the size at runtime but prevents some optimizations, (3) set Module.TOTAL_MEMORY to a higher value before the program runs, or if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ');
}

if (!Module['reallocBuffer']) Module['reallocBuffer'] = function(size) {
  var ret;
  try {
    if (ArrayBuffer.transfer) {
      ret = ArrayBuffer.transfer(buffer, size);
    } else {
      var oldHEAP8 = HEAP8;
      ret = new ArrayBuffer(size);
      var temp = new Int8Array(ret);
      temp.set(oldHEAP8);
    }
  } catch(e) {
    return false;
  }
  var success = _emscripten_replace_memory(ret);
  if (!success) return false;
  return ret;
};

function enlargeMemory() {
  // TOTAL_MEMORY is the current size of the actual array, and DYNAMICTOP is the new top.
  assert(HEAP32[DYNAMICTOP_PTR>>2] > TOTAL_MEMORY); // This function should only ever be called after the ceiling of the dynamic heap has already been bumped to exceed the current total size of the asm.js heap.


  var PAGE_MULTIPLE = Module["usingWasm"] ? WASM_PAGE_SIZE : ASMJS_PAGE_SIZE; // In wasm, heap size must be a multiple of 64KB. In asm.js, they need to be multiples of 16MB.
  var LIMIT = 2147483648 - PAGE_MULTIPLE; // We can do one page short of 2GB as theoretical maximum.

  if (HEAP32[DYNAMICTOP_PTR>>2] > LIMIT) {
    Module.printErr('Cannot enlarge memory, asked to go up to ' + HEAP32[DYNAMICTOP_PTR>>2] + ' bytes, but the limit is ' + LIMIT + ' bytes!');
    return false;
  }

  var OLD_TOTAL_MEMORY = TOTAL_MEMORY;
  TOTAL_MEMORY = Math.max(TOTAL_MEMORY, MIN_TOTAL_MEMORY); // So the loop below will not be infinite, and minimum asm.js memory size is 16MB.

  while (TOTAL_MEMORY < HEAP32[DYNAMICTOP_PTR>>2]) { // Keep incrementing the heap size as long as it's less than what is requested.
    if (TOTAL_MEMORY <= 536870912) {
      TOTAL_MEMORY = alignUp(2 * TOTAL_MEMORY, PAGE_MULTIPLE); // Simple heuristic: double until 1GB...
    } else {
      TOTAL_MEMORY = Math.min(alignUp((3 * TOTAL_MEMORY + 2147483648) / 4, PAGE_MULTIPLE), LIMIT); // ..., but after that, add smaller increments towards 2GB, which we cannot reach
    }
  }

  var start = Date.now();

  var replacement = Module['reallocBuffer'](TOTAL_MEMORY);
  if (!replacement || replacement.byteLength != TOTAL_MEMORY) {
    Module.printErr('Failed to grow the heap from ' + OLD_TOTAL_MEMORY + ' bytes to ' + TOTAL_MEMORY + ' bytes, not enough memory!');
    if (replacement) {
      Module.printErr('Expected to get back a buffer of size ' + TOTAL_MEMORY + ' bytes, but instead got back a buffer of size ' + replacement.byteLength);
    }
    return false;
  }

  // everything worked

  updateGlobalBuffer(replacement);
  updateGlobalBufferViews();

  Module.printErr('enlarged memory arrays from ' + OLD_TOTAL_MEMORY + ' to ' + TOTAL_MEMORY + ', took ' + (Date.now() - start) + ' ms (has ArrayBuffer.transfer? ' + (!!ArrayBuffer.transfer) + ')');

  if (!Module["usingWasm"]) {
    Module.printErr('Warning: Enlarging memory arrays, this is not fast! ' + [OLD_TOTAL_MEMORY, TOTAL_MEMORY]);
  }


  return true;
}

var byteLength;
try {
  byteLength = Function.prototype.call.bind(Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get);
  byteLength(new ArrayBuffer(4)); // can fail on older ie
} catch(e) { // can fail on older node/v8
  byteLength = function(buffer) { return buffer.byteLength; };
}

var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;
if (TOTAL_MEMORY < TOTAL_STACK) Module.printErr('TOTAL_MEMORY should be larger than TOTAL_STACK, was ' + TOTAL_MEMORY + '! (TOTAL_STACK=' + TOTAL_STACK + ')');

// Initialize the runtime's memory
// check for full engine support (use string 'subarray' to avoid closure compiler confusion)
assert(typeof Int32Array !== 'undefined' && typeof Float64Array !== 'undefined' && !!(new Int32Array(1)['subarray']) && !!(new Int32Array(1)['set']),
       'JS engine does not provide full typed array support');



// Use a provided buffer, if there is one, or else allocate a new one
if (Module['buffer']) {
  buffer = Module['buffer'];
  assert(buffer.byteLength === TOTAL_MEMORY, 'provided buffer should be ' + TOTAL_MEMORY + ' bytes, but it is ' + buffer.byteLength);
} else {
  // Use a WebAssembly memory where available
  {
    buffer = new ArrayBuffer(TOTAL_MEMORY);
  }
  assert(buffer.byteLength === TOTAL_MEMORY);
}
updateGlobalBufferViews();


function getTotalMemory() {
  return TOTAL_MEMORY;
}

// Endianness check (note: assumes compiler arch was little-endian)
  HEAP32[0] = 0x63736d65; /* 'emsc' */
HEAP16[1] = 0x6373;
if (HEAPU8[2] !== 0x73 || HEAPU8[3] !== 0x63) throw 'Runtime error: expected the system to be little-endian!';

Module['HEAP'] = HEAP;
Module['buffer'] = buffer;
Module['HEAP8'] = HEAP8;
Module['HEAP16'] = HEAP16;
Module['HEAP32'] = HEAP32;
Module['HEAPU8'] = HEAPU8;
Module['HEAPU16'] = HEAPU16;
Module['HEAPU32'] = HEAPU32;
Module['HEAPF32'] = HEAPF32;
Module['HEAPF64'] = HEAPF64;

function callRuntimeCallbacks(callbacks) {
  while(callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback();
      continue;
    }
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Module['dynCall_v'](func);
      } else {
        Module['dynCall_vi'](func, callback.arg);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}

var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATMAIN__    = []; // functions called when main() is to be run
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the runtime has exited

var runtimeInitialized = false;
var runtimeExited = false;


function preRun() {
  // compatibility - merge in anything from Module['preRun'] at this time
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function ensureInitRuntime() {
  checkStackCookie();
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  checkStackCookie();
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  checkStackCookie();
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}

function postRun() {
  checkStackCookie();
  // compatibility - merge in anything from Module['postRun'] at this time
  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}
Module["addOnPreRun"] = addOnPreRun;

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}
Module["addOnInit"] = addOnInit;

function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}
Module["addOnPreMain"] = addOnPreMain;

function addOnExit(cb) {
  __ATEXIT__.unshift(cb);
}
Module["addOnExit"] = addOnExit;

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}
Module["addOnPostRun"] = addOnPostRun;

// Tools


function intArrayFromString(stringy, dontAddNull, length /* optional */) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}
Module["intArrayFromString"] = intArrayFromString;

function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      assert(false, 'Character code ' + chr + ' (' + String.fromCharCode(chr) + ')  at offset ' + i + ' not in 0x00-0xFF.');
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}
Module["intArrayToString"] = intArrayToString;

// Deprecated: This function should not be called because it is unsafe and does not provide
// a maximum length limit of how many bytes it is allowed to write. Prefer calling the
// function stringToUTF8Array() instead, which takes in a maximum length that can be used
// to be secure from out of bounds writes.
function writeStringToMemory(string, buffer, dontAddNull) {
  Runtime.warnOnce('writeStringToMemory is deprecated and should not be called! Use stringToUTF8() instead!');

  var lastChar, end;
  if (dontAddNull) {
    // stringToUTF8Array always appends null. If we don't want to do that, remember the
    // character that existed at the location where the null will be placed, and restore
    // that after the write (below).
    end = buffer + lengthBytesUTF8(string);
    lastChar = HEAP8[end];
  }
  stringToUTF8(string, buffer, Infinity);
  if (dontAddNull) HEAP8[end] = lastChar; // Restore the value under the null character.
}
Module["writeStringToMemory"] = writeStringToMemory;

function writeArrayToMemory(array, buffer) {
  assert(array.length >= 0, 'writeArrayToMemory array must have a length (should be an array or typed array)')
  HEAP8.set(array, buffer);
}
Module["writeArrayToMemory"] = writeArrayToMemory;

function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    assert(str.charCodeAt(i) === str.charCodeAt(i)&0xff);
    HEAP8[((buffer++)>>0)]=str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer)>>0)]=0;
}
Module["writeAsciiToMemory"] = writeAsciiToMemory;

function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}


// check for imul support, and also for correctness ( https://bugs.webkit.org/show_bug.cgi?id=126345 )
if (!Math['imul'] || Math['imul'](0xffffffff, 5) !== -5) Math['imul'] = function imul(a, b) {
  var ah  = a >>> 16;
  var al = a & 0xffff;
  var bh  = b >>> 16;
  var bl = b & 0xffff;
  return (al*bl + ((ah*bl + al*bh) << 16))|0;
};
Math.imul = Math['imul'];


if (!Math['clz32']) Math['clz32'] = function(x) {
  x = x >>> 0;
  for (var i = 0; i < 32; i++) {
    if (x & (1 << (31 - i))) return i;
  }
  return 32;
};
Math.clz32 = Math['clz32']

if (!Math['trunc']) Math['trunc'] = function(x) {
  return x < 0 ? Math.ceil(x) : Math.floor(x);
};
Math.trunc = Math['trunc'];

var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_round = Math.round;
var Math_min = Math.min;
var Math_clz32 = Math.clz32;
var Math_trunc = Math.trunc;

// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// PRE_RUN_ADDITIONS (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
var runDependencyTracking = {};

function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
  return id;
}

function addRunDependency(id) {
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval !== 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(function() {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            Module.printErr('still waiting on run dependencies:');
          }
          Module.printErr('dependency: ' + dep);
        }
        if (shown) {
          Module.printErr('(end of list)');
        }
      }, 10000);
    }
  } else {
    Module.printErr('warning: run dependency added without ID');
  }
}
Module["addRunDependency"] = addRunDependency;

function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    Module.printErr('warning: run dependency removed without ID');
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}
Module["removeRunDependency"] = removeRunDependency;

Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data



var memoryInitializer = null;



var /* show errors on likely calls to FS when it was not included */ FS = {
  error: function() {
    abort('Filesystem support (FS) was not included. The problem is that you are using files from JS, but files were not used from C/C++, so filesystem support was not auto-included. You can force-include filesystem support with  -s FORCE_FILESYSTEM=1');
  },
  init: function() { FS.error() },
  createDataFile: function() { FS.error() },
  createPreloadedFile: function() { FS.error() },
  createLazyFile: function() { FS.error() },
  open: function() { FS.error() },
  mkdev: function() { FS.error() },
  registerDevice: function() { FS.error() },
  analyzePath: function() { FS.error() },
  loadFilesFromDB: function() { FS.error() },

  ErrnoError: function ErrnoError() { FS.error() },
};
Module['FS_createDataFile'] = FS.createDataFile;
Module['FS_createPreloadedFile'] = FS.createPreloadedFile;



// === Body ===

var ASM_CONSTS = [];




STATIC_BASE = 8;

STATICTOP = STATIC_BASE + 8416;
  /* global initializers */  __ATINIT__.push({ func: function() { __GLOBAL__sub_I_chunks_cpp() } }, { func: function() { __GLOBAL__sub_I_bind_cpp() } });
  

/* memory initializer */ allocate([116,5,0,0,202,6,0,0,116,5,0,0,222,6,0,0,116,5,0,0,36,7,0,0,76,6,0,0,229,6,0,0,0,0,0,0,1,0,0,0,24,0,0,0,0,0,0,0,116,5,0,0,198,7,0,0,76,6,0,0,147,7,0,0,0,0,0,0,1,0,0,0,56,0,0,0,0,0,0,0,76,6,0,0,104,7,0,0,0,0,0,0,1,0,0,0,64,0,0,0,0,0,0,0,48,6,0,0,235,7,0,0,0,0,0,0,88,0,0,0,48,6,0,0,23,8,0,0,1,0,0,0,88,0,0,0,116,5,0,0,79,8,0,0,116,5,0,0,138,11,0,0,116,5,0,0,169,11,0,0,116,5,0,0,200,11,0,0,116,5,0,0,231,11,0,0,116,5,0,0,6,12,0,0,116,5,0,0,37,12,0,0,116,5,0,0,68,12,0,0,116,5,0,0,99,12,0,0,116,5,0,0,130,12,0,0,116,5,0,0,161,12,0,0,116,5,0,0,192,12,0,0,116,5,0,0,223,12,0,0,76,6,0,0,254,12,0,0,0,0,0,0,1,0,0,0,24,0,0,0,0,0,0,0,76,6,0,0,61,13,0,0,0,0,0,0,1,0,0,0,24,0,0,0,0,0,0,0,116,5,0,0,155,23,0,0,156,5,0,0,251,23,0,0,64,1,0,0,0,0,0,0,156,5,0,0,168,23,0,0,80,1,0,0,0,0,0,0,116,5,0,0,201,23,0,0,156,5,0,0,214,23,0,0,48,1,0,0,0,0,0,0,156,5,0,0,30,25,0,0,40,1,0,0,0,0,0,0,156,5,0,0,43,25,0,0,40,1,0,0,0,0,0,0,156,5,0,0,59,25,0,0,120,1,0,0,0,0,0,0,156,5,0,0,76,25,0,0,120,1,0,0,0,0,0,0,156,5,0,0,129,25,0,0,64,1,0,0,0,0,0,0,156,5,0,0,93,25,0,0,168,1,0,0,0,0,0,0,156,5,0,0,163,25,0,0,64,1,0,0,0,0,0,0,20,6,0,0,203,25,0,0,20,6,0,0,205,25,0,0,20,6,0,0,208,25,0,0,20,6,0,0,210,25,0,0,20,6,0,0,212,25,0,0,20,6,0,0,214,25,0,0,20,6,0,0,216,25,0,0,20,6,0,0,218,25,0,0,20,6,0,0,220,25,0,0,20,6,0,0,222,25,0,0,20,6,0,0,224,25,0,0,20,6,0,0,226,25,0,0,20,6,0,0,228,25,0,0,20,6,0,0,230,25,0,0,156,5,0,0,232,25,0,0,48,1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,62,0,0,0,0,0,0,0,62,0,0,0,62,0,0,0,0,0,0,0,62,0,0,0,63,0,0,0,62,0,0,192,62,0,0,0,62,0,0,192,62,0,0,0,0,0,0,0,63,0,0,0,0,0,0,192,62,0,0,0,62,0,0,128,62,0,0,0,62,0,0,128,62,0,0,0,0,0,0,192,62,0,0,0,0,0,0,128,62,0,0,0,62,0,0,0,62,0,0,0,62,0,0,0,62,0,0,0,0,0,0,128,62,0,0,0,0,24,2,0,0,112,0,0,0,216,1,0,0,112,0,0,0,16,0,0,0,216,1,0,0,112,0,0,0,32,2,0,0,16,0,0,0,32,2,0,0,128,0,0,0,144,0,0,0,88,0,0,0,32,2,0,0,232,1,0,0,88,0,0,0,32,2,0,0,16,0,0,0,144,0,0,0,88,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,164,26,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,3,0,0,0,206,28,0,0,0,4,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,10,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,100,4,0,0,232,4,0,0,5,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,0,0,3,0,0,0,214,32,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,255,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,0,0,0,146,23,0,0,0,0,0,0,48,1,0,0,6,0,0,0,7,0,0,0,8,0,0,0,9,0,0,0,10,0,0,0,11,0,0,0,12,0,0,0,13,0,0,0,0,0,0,0,88,1,0,0,6,0,0,0,14,0,0,0,8,0,0,0,9,0,0,0,10,0,0,0,15,0,0,0,16,0,0,0,17,0,0,0,0,0,0,0,104,1,0,0,18,0,0,0,19,0,0,0,20,0,0,0,0,0,0,0,120,1,0,0,21,0,0,0,22,0,0,0,23,0,0,0,0,0,0,0,136,1,0,0,21,0,0,0,24,0,0,0,23,0,0,0,0,0,0,0,152,1,0,0,21,0,0,0,25,0,0,0,23,0,0,0,0,0,0,0,200,1,0,0,6,0,0,0,26,0,0,0,8,0,0,0,9,0,0,0,27,0,0,0,0,0,0,0,184,1,0,0,6,0,0,0,28,0,0,0,8,0,0,0,9,0,0,0,29,0,0,0,0,0,0,0,72,2,0,0,6,0,0,0,30,0,0,0,8,0,0,0,9,0,0,0,10,0,0,0,31,0,0,0,32,0,0,0,33,0,0,0,103,114,97,115,115,0,100,105,114,116,0,115,116,111,110,101,0,65,114,114,97,121,0,70,108,111,97,116,51,50,65,114,114,97,121,0,85,105,110,116,49,54,65,114,114,97,121,0,86,101,99,51,0,66,108,111,99,107,0,112,111,115,105,116,105,111,110,0,116,121,112,101,0,86,101,99,116,111,114,66,108,111,99,107,0,99,104,117,110,107,105,102,121,0,52,86,101,99,51,0,105,0,118,105,0,105,105,105,0,118,105,105,105,0,53,66,108,111,99,107,0,78,83,116,51,95,95,50,49,50,98,97,115,105,99,95,115,116,114,105,110,103,73,99,78,83,95,49,49,99,104,97,114,95,116,114,97,105,116,115,73,99,69,69,78,83,95,57,97,108,108,111,99,97,116,111,114,73,99,69,69,69,69,0,78,83,116,51,95,95,50,50,49,95,95,98,97,115,105,99,95,115,116,114,105,110,103,95,99,111,109,109,111,110,73,76,98,49,69,69,69,0,112,117,115,104,95,98,97,99,107,0,114,101,115,105,122,101,0,115,105,122,101,0,103,101,116,0,115,101,116,0,78,83,116,51,95,95,50,54,118,101,99,116,111,114,73,53,66,108,111,99,107,78,83,95,57,97,108,108,111,99,97,116,111,114,73,83,49,95,69,69,69,69,0,78,83,116,51,95,95,50,49,51,95,95,118,101,99,116,111,114,95,98,97,115,101,73,53,66,108,111,99,107,78,83,95,57,97,108,108,111,99,97,116,111,114,73,83,49,95,69,69,69,69,0,78,83,116,51,95,95,50,50,48,95,95,118,101,99,116,111,114,95,98,97,115,101,95,99,111,109,109,111,110,73,76,98,49,69,69,69,0,80,78,83,116,51,95,95,50,54,118,101,99,116,111,114,73,53,66,108,111,99,107,78,83,95,57,97,108,108,111,99,97,116,111,114,73,83,49,95,69,69,69,69,0,80,75,78,83,116,51,95,95,50,54,118,101,99,116,111,114,73,53,66,108,111,99,107,78,83,95,57,97,108,108,111,99,97,116,111,114,73,83,49,95,69,69,69,69,0,105,105,0,118,0,118,105,105,105,105,0,78,49,48,101,109,115,99,114,105,112,116,101,110,51,118,97,108,69,0,105,105,105,105,0,105,105,105,105,105,0,118,111,105,100,0,98,111,111,108,0,99,104,97,114,0,115,105,103,110,101,100,32,99,104,97,114,0,117,110,115,105,103,110,101,100,32,99,104,97,114,0,115,104,111,114,116,0,117,110,115,105,103,110,101,100,32,115,104,111,114,116,0,105,110,116,0,117,110,115,105,103,110,101,100,32,105,110,116,0,108,111,110,103,0,117,110,115,105,103,110,101,100,32,108,111,110,103,0,102,108,111,97,116,0,100,111,117,98,108,101,0,115,116,100,58,58,115,116,114,105,110,103,0,115,116,100,58,58,98,97,115,105,99,95,115,116,114,105,110,103,60,117,110,115,105,103,110,101,100,32,99,104,97,114,62,0,115,116,100,58,58,119,115,116,114,105,110,103,0,101,109,115,99,114,105,112,116,101,110,58,58,118,97,108,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,99,104,97,114,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,115,105,103,110,101,100,32,99,104,97,114,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,110,115,105,103,110,101,100,32,99,104,97,114,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,115,104,111,114,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,110,115,105,103,110,101,100,32,115,104,111,114,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,105,110,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,110,115,105,103,110,101,100,32,105,110,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,108,111,110,103,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,110,115,105,103,110,101,100,32,108,111,110,103,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,105,110,116,56,95,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,105,110,116,56,95,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,105,110,116,49,54,95,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,105,110,116,49,54,95,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,105,110,116,51,50,95,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,105,110,116,51,50,95,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,102,108,111,97,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,100,111,117,98,108,101,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,108,111,110,103,32,100,111,117,98,108,101,62,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,101,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,100,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,102,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,109,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,108,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,106,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,105,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,116,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,115,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,104,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,97,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,99,69,69,0,78,83,116,51,95,95,50,49,50,98,97,115,105,99,95,115,116,114,105,110,103,73,119,78,83,95,49,49,99,104,97,114,95,116,114,97,105,116,115,73,119,69,69,78,83,95,57,97,108,108,111,99,97,116,111,114,73,119,69,69,69,69,0,78,83,116,51,95,95,50,49,50,98,97,115,105,99,95,115,116,114,105,110,103,73,104,78,83,95,49,49,99,104,97,114,95,116,114,97,105,116,115,73,104,69,69,78,83,95,57,97,108,108,111,99,97,116,111,114,73,104,69,69,69,69,0,17,0,10,0,17,17,17,0,0,0,0,5,0,0,0,0,0,0,9,0,0,0,0,11,0,0,0,0,0,0,0,0,17,0,15,10,17,17,17,3,10,7,0,1,19,9,11,11,0,0,9,6,11,0,0,11,0,6,17,0,0,0,17,17,17,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,0,0,0,0,0,0,0,0,17,0,10,10,17,17,17,0,10,0,0,2,0,9,11,0,0,0,9,0,11,0,0,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,12,0,0,0,0,9,12,0,0,0,0,0,12,0,0,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,14,0,0,0,0,0,0,0,0,0,0,0,13,0,0,0,4,13,0,0,0,0,9,14,0,0,0,0,0,14,0,0,14,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,0,0,0,0,0,0,0,0,0,15,0,0,0,0,15,0,0,0,0,9,16,0,0,0,0,0,16,0,0,16,0,0,18,0,0,0,18,18,18,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,18,0,0,0,18,18,18,0,0,0,0,0,0,9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,0,0,0,0,0,0,0,0,0,0,0,10,0,0,0,0,10,0,0,0,0,9,11,0,0,0,0,0,11,0,0,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,12,0,0,0,0,9,12,0,0,0,0,0,12,0,0,12,0,0,45,43,32,32,32,48,88,48,120,0,40,110,117,108,108,41,0,45,48,88,43,48,88,32,48,88,45,48,120,43,48,120,32,48,120,0,105,110,102,0,73,78,70,0,110,97,110,0,78,65,78,0,48,49,50,51,52,53,54,55,56,57,65,66,67,68,69,70,46,0,84,33,34,25,13,1,2,3,17,75,28,12,16,4,11,29,18,30,39,104,110,111,112,113,98,32,5,6,15,19,20,21,26,8,22,7,40,36,23,24,9,10,14,27,31,37,35,131,130,125,38,42,43,60,61,62,63,67,71,74,77,88,89,90,91,92,93,94,95,96,97,99,100,101,102,103,105,106,107,108,114,115,116,121,122,123,124,0,73,108,108,101,103,97,108,32,98,121,116,101,32,115,101,113,117,101,110,99,101,0,68,111,109,97,105,110,32,101,114,114,111,114,0,82,101,115,117,108,116,32,110,111,116,32,114,101,112,114,101,115,101,110,116,97,98,108,101,0,78,111,116,32,97,32,116,116,121,0,80,101,114,109,105,115,115,105,111,110,32,100,101,110,105,101,100,0,79,112,101,114,97,116,105,111,110,32,110,111,116,32,112,101,114,109,105,116,116,101,100,0,78,111,32,115,117,99,104,32,102,105,108,101,32,111,114,32,100,105,114,101,99,116,111,114,121,0,78,111,32,115,117,99,104,32,112,114,111,99,101,115,115,0,70,105,108,101,32,101,120,105,115,116,115,0,86,97,108,117,101,32,116,111,111,32,108,97,114,103,101,32,102,111,114,32,100,97,116,97,32,116,121,112,101,0,78,111,32,115,112,97,99,101,32,108,101,102,116,32,111,110,32,100,101,118,105,99,101,0,79,117,116,32,111,102,32,109,101,109,111,114,121,0,82,101,115,111,117,114,99,101,32,98,117,115,121,0,73,110,116,101,114,114,117,112,116,101,100,32,115,121,115,116,101,109,32,99,97,108,108,0,82,101,115,111,117,114,99,101,32,116,101,109,112,111,114,97,114,105,108,121,32,117,110,97,118,97,105,108,97,98,108,101,0,73,110,118,97,108,105,100,32,115,101,101,107,0,67,114,111,115,115,45,100,101,118,105,99,101,32,108,105,110,107,0,82,101,97,100,45,111,110,108,121,32,102,105,108,101,32,115,121,115,116,101,109,0,68,105,114,101,99,116,111,114,121,32,110,111,116,32,101,109,112,116,121,0,67,111,110,110,101,99,116,105,111,110,32,114,101,115,101,116,32,98,121,32,112,101,101,114,0,79,112,101,114,97,116,105,111,110,32,116,105,109,101,100,32,111,117,116,0,67,111,110,110,101,99,116,105,111,110,32,114,101,102,117,115,101,100,0,72,111,115,116,32,105,115,32,100,111,119,110,0,72,111,115,116,32,105,115,32,117,110,114,101,97,99,104,97,98,108,101,0,65,100,100,114,101,115,115,32,105,110,32,117,115,101,0,66,114,111,107,101,110,32,112,105,112,101,0,73,47,79,32,101,114,114,111,114,0,78,111,32,115,117,99,104,32,100,101,118,105,99,101,32,111,114,32,97,100,100,114,101,115,115,0,66,108,111,99,107,32,100,101,118,105,99,101,32,114,101,113,117,105,114,101,100,0,78,111,32,115,117,99,104,32,100,101,118,105,99,101,0,78,111,116,32,97,32,100,105,114,101,99,116,111,114,121,0,73,115,32,97,32,100,105,114,101,99,116,111,114,121,0,84,101,120,116,32,102,105,108,101,32,98,117,115,121,0,69,120,101,99,32,102,111,114,109,97,116,32,101,114,114,111,114,0,73,110,118,97,108,105,100,32,97,114,103,117,109,101,110,116,0,65,114,103,117,109,101,110,116,32,108,105,115,116,32,116,111,111,32,108,111,110,103,0,83,121,109,98,111,108,105,99,32,108,105,110,107,32,108,111,111,112,0,70,105,108,101,110,97,109,101,32,116,111,111,32,108,111,110,103,0,84,111,111,32,109,97,110,121,32,111,112,101,110,32,102,105,108,101,115,32,105,110,32,115,121,115,116,101,109,0,78,111,32,102,105,108,101,32,100,101,115,99,114,105,112,116,111,114,115,32,97,118,97,105,108,97,98,108,101,0,66,97,100,32,102,105,108,101,32,100,101,115,99,114,105,112,116,111,114,0,78,111,32,99,104,105,108,100,32,112,114,111,99,101,115,115,0,66,97,100,32,97,100,100,114,101,115,115,0,70,105,108,101,32,116,111,111,32,108,97,114,103,101,0,84,111,111,32,109,97,110,121,32,108,105,110,107,115,0,78,111,32,108,111,99,107,115,32,97,118,97,105,108,97,98,108,101,0,82,101,115,111,117,114,99,101,32,100,101,97,100,108,111,99,107,32,119,111,117,108,100,32,111,99,99,117,114,0,83,116,97,116,101,32,110,111,116,32,114,101,99,111,118,101,114,97,98,108,101,0,80,114,101,118,105,111,117,115,32,111,119,110,101,114,32,100,105,101,100,0,79,112,101,114,97,116,105,111,110,32,99,97,110,99,101,108,101,100,0,70,117,110,99,116,105,111,110,32,110,111,116,32,105,109,112,108,101,109,101,110,116,101,100,0,78,111,32,109,101,115,115,97,103,101,32,111,102,32,100,101,115,105,114,101,100,32,116,121,112,101,0,73,100,101,110,116,105,102,105,101,114,32,114,101,109,111,118,101,100,0,68,101,118,105,99,101,32,110,111,116,32,97,32,115,116,114,101,97,109,0,78,111,32,100,97,116,97,32,97,118,97,105,108,97,98,108,101,0,68,101,118,105,99,101,32,116,105,109,101,111,117,116,0,79,117,116,32,111,102,32,115,116,114,101,97,109,115,32,114,101,115,111,117,114,99,101,115,0,76,105,110,107,32,104,97,115,32,98,101,101,110,32,115,101,118,101,114,101,100,0,80,114,111,116,111,99,111,108,32,101,114,114,111,114,0,66,97,100,32,109,101,115,115,97,103,101,0,70,105,108,101,32,100,101,115,99,114,105,112,116,111,114,32,105,110,32,98,97,100,32,115,116,97,116,101,0,78,111,116,32,97,32,115,111,99,107,101,116,0,68,101,115,116,105,110,97,116,105,111,110,32,97,100,100,114,101,115,115,32,114,101,113,117,105,114,101,100,0,77,101,115,115,97,103,101,32,116,111,111,32,108,97,114,103,101,0,80,114,111,116,111,99,111,108,32,119,114,111,110,103,32,116,121,112,101,32,102,111,114,32,115,111,99,107,101,116,0,80,114,111,116,111,99,111,108,32,110,111,116,32,97,118,97,105,108,97,98,108,101,0,80,114,111,116,111,99,111,108,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,83,111,99,107,101,116,32,116,121,112,101,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,78,111,116,32,115,117,112,112,111,114,116,101,100,0,80,114,111,116,111,99,111,108,32,102,97,109,105,108,121,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,65,100,100,114,101,115,115,32,102,97,109,105,108,121,32,110,111,116,32,115,117,112,112,111,114,116,101,100,32,98,121,32,112,114,111,116,111,99,111,108,0,65,100,100,114,101,115,115,32,110,111,116,32,97,118,97,105,108,97,98,108,101,0,78,101,116,119,111,114,107,32,105,115,32,100,111,119,110,0,78,101,116,119,111,114,107,32,117,110,114,101,97,99,104,97,98,108,101,0,67,111,110,110,101,99,116,105,111,110,32,114,101,115,101,116,32,98,121,32,110,101,116,119,111,114,107,0,67,111,110,110,101,99,116,105,111,110,32,97,98,111,114,116,101,100,0,78,111,32,98,117,102,102,101,114,32,115,112,97,99,101,32,97,118,97,105,108,97,98,108,101,0,83,111,99,107,101,116,32,105,115,32,99,111,110,110,101,99,116,101,100,0,83,111,99,107,101,116,32,110,111,116,32,99,111,110,110,101,99,116,101,100,0,67,97,110,110,111,116,32,115,101,110,100,32,97,102,116,101,114,32,115,111,99,107,101,116,32,115,104,117,116,100,111,119,110,0,79,112,101,114,97,116,105,111,110,32,97,108,114,101,97,100,121,32,105,110,32,112,114,111,103,114,101,115,115,0,79,112,101,114,97,116,105,111,110,32,105,110,32,112,114,111,103,114,101,115,115,0,83,116,97,108,101,32,102,105,108,101,32,104,97,110,100,108,101,0,82,101,109,111,116,101,32,73,47,79,32,101,114,114,111,114,0,81,117,111,116,97,32,101,120,99,101,101,100,101,100,0,78,111,32,109,101,100,105,117,109,32,102,111,117,110,100,0,87,114,111,110,103,32,109,101,100,105,117,109,32,116,121,112,101,0,78,111,32,101,114,114,111,114,32,105,110,102,111,114,109,97,116,105,111,110,0,0,118,101,99,116,111,114,0,98,97,115,105,99,95,115,116,114,105,110,103,0,116,101,114,109,105,110,97,116,105,110,103,32,119,105,116,104,32,37,115,32,101,120,99,101,112,116,105,111,110,32,111,102,32,116,121,112,101,32,37,115,58,32,37,115,0,116,101,114,109,105,110,97,116,105,110,103,32,119,105,116,104,32,37,115,32,101,120,99,101,112,116,105,111,110,32,111,102,32,116,121,112,101,32,37,115,0,116,101,114,109,105,110,97,116,105,110,103,32,119,105,116,104,32,37,115,32,102,111,114,101,105,103,110,32,101,120,99,101,112,116,105,111,110,0,116,101,114,109,105,110,97,116,105,110,103,0,117,110,99,97,117,103,104,116,0,83,116,57,101,120,99,101,112,116,105,111,110,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,54,95,95,115,104,105,109,95,116,121,112,101,95,105,110,102,111,69,0,83,116,57,116,121,112,101,95,105,110,102,111,0,78,49,48,95,95,99,120,120,97,98,105,118,49,50,48,95,95,115,105,95,99,108,97,115,115,95,116,121,112,101,95,105,110,102,111,69,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,55,95,95,99,108,97,115,115,95,116,121,112,101,95,105,110,102,111,69,0,112,116,104,114,101,97,100,95,111,110,99,101,32,102,97,105,108,117,114,101,32,105,110,32,95,95,99,120,97,95,103,101,116,95,103,108,111,98,97,108,115,95,102,97,115,116,40,41,0,99,97,110,110,111,116,32,99,114,101,97,116,101,32,112,116,104,114,101,97,100,32,107,101,121,32,102,111,114,32,95,95,99,120,97,95,103,101,116,95,103,108,111,98,97,108,115,40,41,0,99,97,110,110,111,116,32,122,101,114,111,32,111,117,116,32,116,104,114,101,97,100,32,118,97,108,117,101,32,102,111,114,32,95,95,99,120,97,95,103,101,116,95,103,108,111,98,97,108,115,40,41,0,116,101,114,109,105,110,97,116,101,95,104,97,110,100,108,101,114,32,117,110,101,120,112,101,99,116,101,100,108,121,32,114,101,116,117,114,110,101,100,0,116,101,114,109,105,110,97,116,101,95,104,97,110,100,108,101,114,32,117,110,101,120,112,101,99,116,101,100,108,121,32,116,104,114,101,119,32,97,110,32,101,120,99,101,112,116,105,111,110,0,115,116,100,58,58,98,97,100,95,97,108,108,111,99,0,83,116,57,98,97,100,95,97,108,108,111,99,0,83,116,49,49,108,111,103,105,99,95,101,114,114,111,114,0,83,116,49,50,108,101,110,103,116,104,95,101,114,114,111,114,0,83,116,49,50,111,117,116,95,111,102,95,114,97,110,103,101,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,57,95,95,112,111,105,110,116,101,114,95,116,121,112,101,95,105,110,102,111,69,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,55,95,95,112,98,97,115,101,95,116,121,112,101,95,105,110,102,111,69,0,78,49,48,95,95,99,120,120,97,98,105,118,49,50,51,95,95,102,117,110,100,97,109,101,110,116,97,108,95,116,121,112,101,95,105,110,102,111,69,0,118,0,68,110,0,98,0,99,0,104,0,97,0,115,0,116,0,105,0,106,0,108,0,109,0,102,0,100,0,78,49,48,95,95,99,120,120,97,98,105,118,49,50,49,95,95,118,109,105,95,99,108,97,115,115,95,116,121,112,101,95,105,110,102,111,69,0], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE);





/* no memory initializer */
var tempDoublePtr = STATICTOP; STATICTOP += 16;

assert(tempDoublePtr % 8 == 0);

function copyTempFloat(ptr) { // functions, because inlining this code increases code size too much

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

}

function copyTempDouble(ptr) {

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

  HEAP8[tempDoublePtr+4] = HEAP8[ptr+4];

  HEAP8[tempDoublePtr+5] = HEAP8[ptr+5];

  HEAP8[tempDoublePtr+6] = HEAP8[ptr+6];

  HEAP8[tempDoublePtr+7] = HEAP8[ptr+7];

}

// {{PRE_LIBRARY}}


  
  function _atexit(func, arg) {
      __ATEXIT__.unshift({ func: func, arg: arg });
    }function ___cxa_atexit() {
  return _atexit.apply(null, arguments)
  }

  
  var structRegistrations={};
  
  
  
  function embind_init_charCodes() {
      var codes = new Array(256);
      for (var i = 0; i < 256; ++i) {
          codes[i] = String.fromCharCode(i);
      }
      embind_charCodes = codes;
    }var embind_charCodes=undefined;function readLatin1String(ptr) {
      var ret = "";
      var c = ptr;
      while (HEAPU8[c]) {
          ret += embind_charCodes[HEAPU8[c++]];
      }
      return ret;
    }
  
  
  
  
  
  
  
  var char_0=48;
  
  var char_9=57;function makeLegalFunctionName(name) {
      if (undefined === name) {
          return '_unknown';
      }
      name = name.replace(/[^a-zA-Z0-9_]/g, '$');
      var f = name.charCodeAt(0);
      if (f >= char_0 && f <= char_9) {
          return '_' + name;
      } else {
          return name;
      }
    }function createNamedFunction(name, body) {
      name = makeLegalFunctionName(name);
      /*jshint evil:true*/
      return new Function(
          "body",
          "return function " + name + "() {\n" +
          "    \"use strict\";" +
          "    return body.apply(this, arguments);\n" +
          "};\n"
      )(body);
    }function extendError(baseErrorType, errorName) {
      var errorClass = createNamedFunction(errorName, function(message) {
          this.name = errorName;
          this.message = message;
  
          var stack = (new Error(message)).stack;
          if (stack !== undefined) {
              this.stack = this.toString() + '\n' +
                  stack.replace(/^Error(:[^\n]*)?\n/, '');
          }
      });
      errorClass.prototype = Object.create(baseErrorType.prototype);
      errorClass.prototype.constructor = errorClass;
      errorClass.prototype.toString = function() {
          if (this.message === undefined) {
              return this.name;
          } else {
              return this.name + ': ' + this.message;
          }
      };
  
      return errorClass;
    }var BindingError=undefined;function throwBindingError(message) {
      throw new BindingError(message);
    }function requireFunction(signature, rawFunction) {
      signature = readLatin1String(signature);
  
      function makeDynCaller(dynCall) {
          var args = [];
          for (var i = 1; i < signature.length; ++i) {
              args.push('a' + i);
          }
  
          var name = 'dynCall_' + signature + '_' + rawFunction;
          var body = 'return function ' + name + '(' + args.join(', ') + ') {\n';
          body    += '    return dynCall(rawFunction' + (args.length ? ', ' : '') + args.join(', ') + ');\n';
          body    += '};\n';
  
          return (new Function('dynCall', 'rawFunction', body))(dynCall, rawFunction);
      }
  
      var fp;
      if (Module['FUNCTION_TABLE_' + signature] !== undefined) {
          fp = Module['FUNCTION_TABLE_' + signature][rawFunction];
      } else if (typeof FUNCTION_TABLE !== "undefined") {
          fp = FUNCTION_TABLE[rawFunction];
      } else {
          // asm.js does not give direct access to the function tables,
          // and thus we must go through the dynCall interface which allows
          // calling into a signature's function table by pointer value.
          //
          // https://github.com/dherman/asm.js/issues/83
          //
          // This has three main penalties:
          // - dynCall is another function call in the path from JavaScript to C++.
          // - JITs may not predict through the function table indirection at runtime.
          var dc = Module["asm"]['dynCall_' + signature];
          if (dc === undefined) {
              // We will always enter this branch if the signature
              // contains 'f' and PRECISE_F32 is not enabled.
              //
              // Try again, replacing 'f' with 'd'.
              dc = Module["asm"]['dynCall_' + signature.replace(/f/g, 'd')];
              if (dc === undefined) {
                  throwBindingError("No dynCall invoker for signature: " + signature);
              }
          }
          fp = makeDynCaller(dc);
      }
  
      if (typeof fp !== "function") {
          throwBindingError("unknown function pointer with signature " + signature + ": " + rawFunction);
      }
      return fp;
    }function __embind_register_value_object(
      rawType,
      name,
      constructorSignature,
      rawConstructor,
      destructorSignature,
      rawDestructor
    ) {
      structRegistrations[rawType] = {
          name: readLatin1String(name),
          rawConstructor: requireFunction(constructorSignature, rawConstructor),
          rawDestructor: requireFunction(destructorSignature, rawDestructor),
          fields: [],
      };
    }

   
  Module["_i64Subtract"] = _i64Subtract;

   
  Module["_i64Add"] = _i64Add;

  
  
  var awaitingDependencies={};
  
  var registeredTypes={};
  
  var typeDependencies={};
  
  
  
  var InternalError=undefined;function throwInternalError(message) {
      throw new InternalError(message);
    }function whenDependentTypesAreResolved(myTypes, dependentTypes, getTypeConverters) {
      myTypes.forEach(function(type) {
          typeDependencies[type] = dependentTypes;
      });
  
      function onComplete(typeConverters) {
          var myTypeConverters = getTypeConverters(typeConverters);
          if (myTypeConverters.length !== myTypes.length) {
              throwInternalError('Mismatched type converter count');
          }
          for (var i = 0; i < myTypes.length; ++i) {
              registerType(myTypes[i], myTypeConverters[i]);
          }
      }
  
      var typeConverters = new Array(dependentTypes.length);
      var unregisteredTypes = [];
      var registered = 0;
      dependentTypes.forEach(function(dt, i) {
          if (registeredTypes.hasOwnProperty(dt)) {
              typeConverters[i] = registeredTypes[dt];
          } else {
              unregisteredTypes.push(dt);
              if (!awaitingDependencies.hasOwnProperty(dt)) {
                  awaitingDependencies[dt] = [];
              }
              awaitingDependencies[dt].push(function() {
                  typeConverters[i] = registeredTypes[dt];
                  ++registered;
                  if (registered === unregisteredTypes.length) {
                      onComplete(typeConverters);
                  }
              });
          }
      });
      if (0 === unregisteredTypes.length) {
          onComplete(typeConverters);
      }
    }function registerType(rawType, registeredInstance, options) {
      options = options || {};
  
      if (!('argPackAdvance' in registeredInstance)) {
          throw new TypeError('registerType registeredInstance requires argPackAdvance');
      }
  
      var name = registeredInstance.name;
      if (!rawType) {
          throwBindingError('type "' + name + '" must have a positive integer typeid pointer');
      }
      if (registeredTypes.hasOwnProperty(rawType)) {
          if (options.ignoreDuplicateRegistrations) {
              return;
          } else {
              throwBindingError("Cannot register type '" + name + "' twice");
          }
      }
  
      registeredTypes[rawType] = registeredInstance;
      delete typeDependencies[rawType];
  
      if (awaitingDependencies.hasOwnProperty(rawType)) {
          var callbacks = awaitingDependencies[rawType];
          delete awaitingDependencies[rawType];
          callbacks.forEach(function(cb) {
              cb();
          });
      }
    }function __embind_register_void(rawType, name) {
      name = readLatin1String(name);
      registerType(rawType, {
          isVoid: true, // void return values can be optimized out sometimes
          name: name,
          'argPackAdvance': 0,
          'fromWireType': function() {
              return undefined;
          },
          'toWireType': function(destructors, o) {
              // TODO: assert if anything else is given?
              return undefined;
          },
      });
    }

  
  function __ZSt18uncaught_exceptionv() { // std::uncaught_exception()
      return !!__ZSt18uncaught_exceptionv.uncaught_exception;
    }
  
  
  
  var EXCEPTIONS={last:0,caught:[],infos:{},deAdjust:function (adjusted) {
        if (!adjusted || EXCEPTIONS.infos[adjusted]) return adjusted;
        for (var ptr in EXCEPTIONS.infos) {
          var info = EXCEPTIONS.infos[ptr];
          if (info.adjusted === adjusted) {
            return ptr;
          }
        }
        return adjusted;
      },addRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount++;
      },decRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        assert(info.refcount > 0);
        info.refcount--;
        // A rethrown exception can reach refcount 0; it must not be discarded
        // Its next handler will clear the rethrown flag and addRef it, prior to
        // final decRef and destruction here
        if (info.refcount === 0 && !info.rethrown) {
          if (info.destructor) {
            Module['dynCall_vi'](info.destructor, ptr);
          }
          delete EXCEPTIONS.infos[ptr];
          ___cxa_free_exception(ptr);
        }
      },clearRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount = 0;
      }};
  function ___resumeException(ptr) {
      if (!EXCEPTIONS.last) { EXCEPTIONS.last = ptr; }
      throw ptr;
    }function ___cxa_find_matching_catch() {
      var thrown = EXCEPTIONS.last;
      if (!thrown) {
        // just pass through the null ptr
        return ((Runtime.setTempRet0(0),0)|0);
      }
      var info = EXCEPTIONS.infos[thrown];
      var throwntype = info.type;
      if (!throwntype) {
        // just pass through the thrown ptr
        return ((Runtime.setTempRet0(0),thrown)|0);
      }
      var typeArray = Array.prototype.slice.call(arguments);
  
      var pointer = Module['___cxa_is_pointer_type'](throwntype);
      // can_catch receives a **, add indirection
      if (!___cxa_find_matching_catch.buffer) ___cxa_find_matching_catch.buffer = _malloc(4);
      HEAP32[((___cxa_find_matching_catch.buffer)>>2)]=thrown;
      thrown = ___cxa_find_matching_catch.buffer;
      // The different catch blocks are denoted by different types.
      // Due to inheritance, those types may not precisely match the
      // type of the thrown object. Find one which matches, and
      // return the type of the catch block which should be called.
      for (var i = 0; i < typeArray.length; i++) {
        if (typeArray[i] && Module['___cxa_can_catch'](typeArray[i], throwntype, thrown)) {
          thrown = HEAP32[((thrown)>>2)]; // undo indirection
          info.adjusted = thrown;
          return ((Runtime.setTempRet0(typeArray[i]),thrown)|0);
        }
      }
      // Shouldn't happen unless we have bogus data in typeArray
      // or encounter a type for which emscripten doesn't have suitable
      // typeinfo defined. Best-efforts match just in case.
      thrown = HEAP32[((thrown)>>2)]; // undo indirection
      return ((Runtime.setTempRet0(throwntype),thrown)|0);
    }function ___cxa_throw(ptr, type, destructor) {
      EXCEPTIONS.infos[ptr] = {
        ptr: ptr,
        adjusted: ptr,
        type: type,
        destructor: destructor,
        refcount: 0,
        caught: false,
        rethrown: false
      };
      EXCEPTIONS.last = ptr;
      if (!("uncaught_exception" in __ZSt18uncaught_exceptionv)) {
        __ZSt18uncaught_exceptionv.uncaught_exception = 1;
      } else {
        __ZSt18uncaught_exceptionv.uncaught_exception++;
      }
      throw ptr;
    }

   
  Module["_memset"] = _memset;

  
  function getShiftFromSize(size) {
      switch (size) {
          case 1: return 0;
          case 2: return 1;
          case 4: return 2;
          case 8: return 3;
          default:
              throw new TypeError('Unknown type size: ' + size);
      }
    }function __embind_register_bool(rawType, name, size, trueValue, falseValue) {
      var shift = getShiftFromSize(size);
  
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': function(wt) {
              // ambiguous emscripten ABI: sometimes return values are
              // true or false, and sometimes integers (0 or 1)
              return !!wt;
          },
          'toWireType': function(destructors, o) {
              return o ? trueValue : falseValue;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': function(pointer) {
              // TODO: if heap is fixed (like in asm.js) this could be executed outside
              var heap;
              if (size === 1) {
                  heap = HEAP8;
              } else if (size === 2) {
                  heap = HEAP16;
              } else if (size === 4) {
                  heap = HEAP32;
              } else {
                  throw new TypeError("Unknown boolean type size: " + name);
              }
              return this['fromWireType'](heap[pointer >> shift]);
          },
          destructorFunction: null, // This type does not need a destructor
      });
    }

   
  Module["_bitshift64Shl"] = _bitshift64Shl;

  
  
  
  var emval_free_list=[];
  
  var emval_handle_array=[{},{value:undefined},{value:null},{value:true},{value:false}];
  
  
  function count_emval_handles() {
      var count = 0;
      for (var i = 5; i < emval_handle_array.length; ++i) {
          if (emval_handle_array[i] !== undefined) {
              ++count;
          }
      }
      return count;
    }
  
  function get_first_emval() {
      for (var i = 5; i < emval_handle_array.length; ++i) {
          if (emval_handle_array[i] !== undefined) {
              return emval_handle_array[i];
          }
      }
      return null;
    }function init_emval() {
      Module['count_emval_handles'] = count_emval_handles;
      Module['get_first_emval'] = get_first_emval;
    }function __emval_register(value) {
  
      switch(value){
        case undefined :{ return 1; }
        case null :{ return 2; }
        case true :{ return 3; }
        case false :{ return 4; }
        default:{
          var handle = emval_free_list.length ?
              emval_free_list.pop() :
              emval_handle_array.length;
  
          emval_handle_array[handle] = {refcount: 1, value: value};
          return handle;
          }
        }
    }
  
  
  
  function _free() {
  }
  Module["_free"] = _free;function getTypeName(type) {
      var ptr = ___getTypeName(type);
      var rv = readLatin1String(ptr);
      _free(ptr);
      return rv;
    }function requireRegisteredType(rawType, humanName) {
      var impl = registeredTypes[rawType];
      if (undefined === impl) {
          throwBindingError(humanName + " has unknown type " + getTypeName(rawType));
      }
      return impl;
    }function craftEmvalAllocator(argCount) {
      /*This function returns a new function that looks like this:
      function emval_allocator_3(constructor, argTypes, args) {
          var argType0 = requireRegisteredType(HEAP32[(argTypes >> 2)], "parameter 0");
          var arg0 = argType0.readValueFromPointer(args);
          var argType1 = requireRegisteredType(HEAP32[(argTypes >> 2) + 1], "parameter 1");
          var arg1 = argType1.readValueFromPointer(args + 8);
          var argType2 = requireRegisteredType(HEAP32[(argTypes >> 2) + 2], "parameter 2");
          var arg2 = argType2.readValueFromPointer(args + 16);
          var obj = new constructor(arg0, arg1, arg2);
          return __emval_register(obj);
      } */
  
      var argsList = "";
      for(var i = 0; i < argCount; ++i) {
          argsList += (i!==0?", ":"")+"arg"+i; // 'arg0, arg1, ..., argn'
      }
  
      var functionBody =
          "return function emval_allocator_"+argCount+"(constructor, argTypes, args) {\n";
  
      for(var i = 0; i < argCount; ++i) {
          functionBody +=
              "var argType"+i+" = requireRegisteredType(HEAP32[(argTypes >> 2) + "+i+"], \"parameter "+i+"\");\n" +
              "var arg"+i+" = argType"+i+".readValueFromPointer(args);\n" +
              "args += argType"+i+"['argPackAdvance'];\n";
      }
      functionBody +=
          "var obj = new constructor("+argsList+");\n" +
          "return __emval_register(obj);\n" +
          "}\n";
  
      /*jshint evil:true*/
      return (new Function("requireRegisteredType", "HEAP32", "__emval_register", functionBody))(
          requireRegisteredType, HEAP32, __emval_register);
    }
  
  var emval_newers={};
  
  function requireHandle(handle) {
      if (!handle) {
          throwBindingError('Cannot use deleted val. handle = ' + handle);
      }
      return emval_handle_array[handle].value;
    }function __emval_new(handle, argCount, argTypes, args) {
      handle = requireHandle(handle);
  
      var newer = emval_newers[argCount];
      if (!newer) {
          newer = craftEmvalAllocator(argCount);
          emval_newers[argCount] = newer;
      }
  
      return newer(handle, argTypes, args);
    }

  
  function _malloc(bytes) {
      /* Over-allocate to make sure it is byte-aligned by 8.
       * This will leak memory, but this is only the dummy
       * implementation (replaced by dlmalloc normally) so
       * not an issue.
       */
      var ptr = Runtime.dynamicAlloc(bytes + 8);
      return (ptr+8) & 0xFFFFFFF8;
    }
  Module["_malloc"] = _malloc;
  
  function simpleReadValueFromPointer(pointer) {
      return this['fromWireType'](HEAPU32[pointer >> 2]);
    }function __embind_register_std_string(rawType, name) {
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': function(value) {
              var length = HEAPU32[value >> 2];
              var a = new Array(length);
              for (var i = 0; i < length; ++i) {
                  a[i] = String.fromCharCode(HEAPU8[value + 4 + i]);
              }
              _free(value);
              return a.join('');
          },
          'toWireType': function(destructors, value) {
              if (value instanceof ArrayBuffer) {
                  value = new Uint8Array(value);
              }
  
              function getTAElement(ta, index) {
                  return ta[index];
              }
              function getStringElement(string, index) {
                  return string.charCodeAt(index);
              }
              var getElement;
              if (value instanceof Uint8Array) {
                  getElement = getTAElement;
              } else if (value instanceof Uint8ClampedArray) {
                  getElement = getTAElement;
              } else if (value instanceof Int8Array) {
                  getElement = getTAElement;
              } else if (typeof value === 'string') {
                  getElement = getStringElement;
              } else {
                  throwBindingError('Cannot pass non-string to std::string');
              }
  
              // assumes 4-byte alignment
              var length = value.length;
              var ptr = _malloc(4 + length);
              HEAPU32[ptr >> 2] = length;
              for (var i = 0; i < length; ++i) {
                  var charCode = getElement(value, i);
                  if (charCode > 255) {
                      _free(ptr);
                      throwBindingError('String has UTF-16 code units that do not fit in 8 bits');
                  }
                  HEAPU8[ptr + 4 + i] = charCode;
              }
              if (destructors !== null) {
                  destructors.push(_free, ptr);
              }
              return ptr;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': simpleReadValueFromPointer,
          destructorFunction: function(ptr) { _free(ptr); },
      });
    }

  function ___cxa_free_exception(ptr) {
      try {
        return _free(ptr);
      } catch(e) { // XXX FIXME
        Module.printErr('exception during cxa_free_exception: ' + e);
      }
    }

  function _pthread_once(ptr, func) {
      if (!_pthread_once.seen) _pthread_once.seen = {};
      if (ptr in _pthread_once.seen) return;
      Module['dynCall_v'](func);
      _pthread_once.seen[ptr] = 1;
    }

  function __embind_register_value_object_field(
      structType,
      fieldName,
      getterReturnType,
      getterSignature,
      getter,
      getterContext,
      setterArgumentType,
      setterSignature,
      setter,
      setterContext
    ) {
      structRegistrations[structType].fields.push({
          fieldName: readLatin1String(fieldName),
          getterReturnType: getterReturnType,
          getter: requireFunction(getterSignature, getter),
          getterContext: getterContext,
          setterArgumentType: setterArgumentType,
          setter: requireFunction(setterSignature, setter),
          setterContext: setterContext,
      });
    }

  
  
  
  function ClassHandle_isAliasOf(other) {
      if (!(this instanceof ClassHandle)) {
          return false;
      }
      if (!(other instanceof ClassHandle)) {
          return false;
      }
  
      var leftClass = this.$$.ptrType.registeredClass;
      var left = this.$$.ptr;
      var rightClass = other.$$.ptrType.registeredClass;
      var right = other.$$.ptr;
  
      while (leftClass.baseClass) {
          left = leftClass.upcast(left);
          leftClass = leftClass.baseClass;
      }
  
      while (rightClass.baseClass) {
          right = rightClass.upcast(right);
          rightClass = rightClass.baseClass;
      }
  
      return leftClass === rightClass && left === right;
    }
  
  
  function shallowCopyInternalPointer(o) {
      return {
          count: o.count,
          deleteScheduled: o.deleteScheduled,
          preservePointerOnDelete: o.preservePointerOnDelete,
          ptr: o.ptr,
          ptrType: o.ptrType,
          smartPtr: o.smartPtr,
          smartPtrType: o.smartPtrType,
      };
    }
  
  function throwInstanceAlreadyDeleted(obj) {
      function getInstanceTypeName(handle) {
        return handle.$$.ptrType.registeredClass.name;
      }
      throwBindingError(getInstanceTypeName(obj) + ' instance already deleted');
    }function ClassHandle_clone() {
      if (!this.$$.ptr) {
          throwInstanceAlreadyDeleted(this);
      }
  
      if (this.$$.preservePointerOnDelete) {
          this.$$.count.value += 1;
          return this;
      } else {
          var clone = Object.create(Object.getPrototypeOf(this), {
              $$: {
                  value: shallowCopyInternalPointer(this.$$),
              }
          });
  
          clone.$$.count.value += 1;
          clone.$$.deleteScheduled = false;
          return clone;
      }
    }
  
  
  function runDestructor(handle) {
      var $$ = handle.$$;
      if ($$.smartPtr) {
          $$.smartPtrType.rawDestructor($$.smartPtr);
      } else {
          $$.ptrType.registeredClass.rawDestructor($$.ptr);
      }
    }function ClassHandle_delete() {
      if (!this.$$.ptr) {
          throwInstanceAlreadyDeleted(this);
      }
  
      if (this.$$.deleteScheduled && !this.$$.preservePointerOnDelete) {
          throwBindingError('Object already scheduled for deletion');
      }
  
      this.$$.count.value -= 1;
      var toDelete = 0 === this.$$.count.value;
      if (toDelete) {
          runDestructor(this);
      }
      if (!this.$$.preservePointerOnDelete) {
          this.$$.smartPtr = undefined;
          this.$$.ptr = undefined;
      }
    }
  
  function ClassHandle_isDeleted() {
      return !this.$$.ptr;
    }
  
  
  var delayFunction=undefined;
  
  var deletionQueue=[];
  
  function flushPendingDeletes() {
      while (deletionQueue.length) {
          var obj = deletionQueue.pop();
          obj.$$.deleteScheduled = false;
          obj['delete']();
      }
    }function ClassHandle_deleteLater() {
      if (!this.$$.ptr) {
          throwInstanceAlreadyDeleted(this);
      }
      if (this.$$.deleteScheduled && !this.$$.preservePointerOnDelete) {
          throwBindingError('Object already scheduled for deletion');
      }
      deletionQueue.push(this);
      if (deletionQueue.length === 1 && delayFunction) {
          delayFunction(flushPendingDeletes);
      }
      this.$$.deleteScheduled = true;
      return this;
    }function init_ClassHandle() {
      ClassHandle.prototype['isAliasOf'] = ClassHandle_isAliasOf;
      ClassHandle.prototype['clone'] = ClassHandle_clone;
      ClassHandle.prototype['delete'] = ClassHandle_delete;
      ClassHandle.prototype['isDeleted'] = ClassHandle_isDeleted;
      ClassHandle.prototype['deleteLater'] = ClassHandle_deleteLater;
    }function ClassHandle() {
    }
  
  var registeredPointers={};
  
  
  function ensureOverloadTable(proto, methodName, humanName) {
      if (undefined === proto[methodName].overloadTable) {
          var prevFunc = proto[methodName];
          // Inject an overload resolver function that routes to the appropriate overload based on the number of arguments.
          proto[methodName] = function() {
              // TODO This check can be removed in -O3 level "unsafe" optimizations.
              if (!proto[methodName].overloadTable.hasOwnProperty(arguments.length)) {
                  throwBindingError("Function '" + humanName + "' called with an invalid number of arguments (" + arguments.length + ") - expects one of (" + proto[methodName].overloadTable + ")!");
              }
              return proto[methodName].overloadTable[arguments.length].apply(this, arguments);
          };
          // Move the previous function into the overload table.
          proto[methodName].overloadTable = [];
          proto[methodName].overloadTable[prevFunc.argCount] = prevFunc;
      }
    }function exposePublicSymbol(name, value, numArguments) {
      if (Module.hasOwnProperty(name)) {
          if (undefined === numArguments || (undefined !== Module[name].overloadTable && undefined !== Module[name].overloadTable[numArguments])) {
              throwBindingError("Cannot register public name '" + name + "' twice");
          }
  
          // We are exposing a function with the same name as an existing function. Create an overload table and a function selector
          // that routes between the two.
          ensureOverloadTable(Module, name, name);
          if (Module.hasOwnProperty(numArguments)) {
              throwBindingError("Cannot register multiple overloads of a function with the same number of arguments (" + numArguments + ")!");
          }
          // Add the new function into the overload table.
          Module[name].overloadTable[numArguments] = value;
      }
      else {
          Module[name] = value;
          if (undefined !== numArguments) {
              Module[name].numArguments = numArguments;
          }
      }
    }
  
  function RegisteredClass(
      name,
      constructor,
      instancePrototype,
      rawDestructor,
      baseClass,
      getActualType,
      upcast,
      downcast
    ) {
      this.name = name;
      this.constructor = constructor;
      this.instancePrototype = instancePrototype;
      this.rawDestructor = rawDestructor;
      this.baseClass = baseClass;
      this.getActualType = getActualType;
      this.upcast = upcast;
      this.downcast = downcast;
      this.pureVirtualFunctions = [];
    }
  
  
  
  function upcastPointer(ptr, ptrClass, desiredClass) {
      while (ptrClass !== desiredClass) {
          if (!ptrClass.upcast) {
              throwBindingError("Expected null or instance of " + desiredClass.name + ", got an instance of " + ptrClass.name);
          }
          ptr = ptrClass.upcast(ptr);
          ptrClass = ptrClass.baseClass;
      }
      return ptr;
    }function constNoSmartPtrRawPointerToWireType(destructors, handle) {
      if (handle === null) {
          if (this.isReference) {
              throwBindingError('null is not a valid ' + this.name);
          }
          return 0;
      }
  
      if (!handle.$$) {
          throwBindingError('Cannot pass "' + _embind_repr(handle) + '" as a ' + this.name);
      }
      if (!handle.$$.ptr) {
          throwBindingError('Cannot pass deleted object as a pointer of type ' + this.name);
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
      return ptr;
    }
  
  function genericPointerToWireType(destructors, handle) {
      if (handle === null) {
          if (this.isReference) {
              throwBindingError('null is not a valid ' + this.name);
          }
  
          if (this.isSmartPointer) {
              var ptr = this.rawConstructor();
              if (destructors !== null) {
                  destructors.push(this.rawDestructor, ptr);
              }
              return ptr;
          } else {
              return 0;
          }
      }
  
      if (!handle.$$) {
          throwBindingError('Cannot pass "' + _embind_repr(handle) + '" as a ' + this.name);
      }
      if (!handle.$$.ptr) {
          throwBindingError('Cannot pass deleted object as a pointer of type ' + this.name);
      }
      if (!this.isConst && handle.$$.ptrType.isConst) {
          throwBindingError('Cannot convert argument of type ' + (handle.$$.smartPtrType ? handle.$$.smartPtrType.name : handle.$$.ptrType.name) + ' to parameter type ' + this.name);
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
  
      if (this.isSmartPointer) {
          // TODO: this is not strictly true
          // We could support BY_EMVAL conversions from raw pointers to smart pointers
          // because the smart pointer can hold a reference to the handle
          if (undefined === handle.$$.smartPtr) {
              throwBindingError('Passing raw pointer to smart pointer is illegal');
          }
  
          switch (this.sharingPolicy) {
              case 0: // NONE
                  // no upcasting
                  if (handle.$$.smartPtrType === this) {
                      ptr = handle.$$.smartPtr;
                  } else {
                      throwBindingError('Cannot convert argument of type ' + (handle.$$.smartPtrType ? handle.$$.smartPtrType.name : handle.$$.ptrType.name) + ' to parameter type ' + this.name);
                  }
                  break;
  
              case 1: // INTRUSIVE
                  ptr = handle.$$.smartPtr;
                  break;
  
              case 2: // BY_EMVAL
                  if (handle.$$.smartPtrType === this) {
                      ptr = handle.$$.smartPtr;
                  } else {
                      var clonedHandle = handle['clone']();
                      ptr = this.rawShare(
                          ptr,
                          __emval_register(function() {
                              clonedHandle['delete']();
                          })
                      );
                      if (destructors !== null) {
                          destructors.push(this.rawDestructor, ptr);
                      }
                  }
                  break;
  
              default:
                  throwBindingError('Unsupporting sharing policy');
          }
      }
      return ptr;
    }
  
  function nonConstNoSmartPtrRawPointerToWireType(destructors, handle) {
      if (handle === null) {
          if (this.isReference) {
              throwBindingError('null is not a valid ' + this.name);
          }
          return 0;
      }
  
      if (!handle.$$) {
          throwBindingError('Cannot pass "' + _embind_repr(handle) + '" as a ' + this.name);
      }
      if (!handle.$$.ptr) {
          throwBindingError('Cannot pass deleted object as a pointer of type ' + this.name);
      }
      if (handle.$$.ptrType.isConst) {
          throwBindingError('Cannot convert argument of type ' + handle.$$.ptrType.name + ' to parameter type ' + this.name);
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
      return ptr;
    }
  
  
  function RegisteredPointer_getPointee(ptr) {
      if (this.rawGetPointee) {
          ptr = this.rawGetPointee(ptr);
      }
      return ptr;
    }
  
  function RegisteredPointer_destructor(ptr) {
      if (this.rawDestructor) {
          this.rawDestructor(ptr);
      }
    }
  
  function RegisteredPointer_deleteObject(handle) {
      if (handle !== null) {
          handle['delete']();
      }
    }
  
  
  function downcastPointer(ptr, ptrClass, desiredClass) {
      if (ptrClass === desiredClass) {
          return ptr;
      }
      if (undefined === desiredClass.baseClass) {
          return null; // no conversion
      }
  
      var rv = downcastPointer(ptr, ptrClass, desiredClass.baseClass);
      if (rv === null) {
          return null;
      }
      return desiredClass.downcast(rv);
    }
  
  
  
  
  function getInheritedInstanceCount() {
      return Object.keys(registeredInstances).length;
    }
  
  function getLiveInheritedInstances() {
      var rv = [];
      for (var k in registeredInstances) {
          if (registeredInstances.hasOwnProperty(k)) {
              rv.push(registeredInstances[k]);
          }
      }
      return rv;
    }
  
  function setDelayFunction(fn) {
      delayFunction = fn;
      if (deletionQueue.length && delayFunction) {
          delayFunction(flushPendingDeletes);
      }
    }function init_embind() {
      Module['getInheritedInstanceCount'] = getInheritedInstanceCount;
      Module['getLiveInheritedInstances'] = getLiveInheritedInstances;
      Module['flushPendingDeletes'] = flushPendingDeletes;
      Module['setDelayFunction'] = setDelayFunction;
    }var registeredInstances={};
  
  function getBasestPointer(class_, ptr) {
      if (ptr === undefined) {
          throwBindingError('ptr should not be undefined');
      }
      while (class_.baseClass) {
          ptr = class_.upcast(ptr);
          class_ = class_.baseClass;
      }
      return ptr;
    }function getInheritedInstance(class_, ptr) {
      ptr = getBasestPointer(class_, ptr);
      return registeredInstances[ptr];
    }
  
  function makeClassHandle(prototype, record) {
      if (!record.ptrType || !record.ptr) {
          throwInternalError('makeClassHandle requires ptr and ptrType');
      }
      var hasSmartPtrType = !!record.smartPtrType;
      var hasSmartPtr = !!record.smartPtr;
      if (hasSmartPtrType !== hasSmartPtr) {
          throwInternalError('Both smartPtrType and smartPtr must be specified');
      }
      record.count = { value: 1 };
      return Object.create(prototype, {
          $$: {
              value: record,
          },
      });
    }function RegisteredPointer_fromWireType(ptr) {
      // ptr is a raw pointer (or a raw smartpointer)
  
      // rawPointer is a maybe-null raw pointer
      var rawPointer = this.getPointee(ptr);
      if (!rawPointer) {
          this.destructor(ptr);
          return null;
      }
  
      var registeredInstance = getInheritedInstance(this.registeredClass, rawPointer);
      if (undefined !== registeredInstance) {
          // JS object has been neutered, time to repopulate it
          if (0 === registeredInstance.$$.count.value) {
              registeredInstance.$$.ptr = rawPointer;
              registeredInstance.$$.smartPtr = ptr;
              return registeredInstance['clone']();
          } else {
              // else, just increment reference count on existing object
              // it already has a reference to the smart pointer
              var rv = registeredInstance['clone']();
              this.destructor(ptr);
              return rv;
          }
      }
  
      function makeDefaultHandle() {
          if (this.isSmartPointer) {
              return makeClassHandle(this.registeredClass.instancePrototype, {
                  ptrType: this.pointeeType,
                  ptr: rawPointer,
                  smartPtrType: this,
                  smartPtr: ptr,
              });
          } else {
              return makeClassHandle(this.registeredClass.instancePrototype, {
                  ptrType: this,
                  ptr: ptr,
              });
          }
      }
  
      var actualType = this.registeredClass.getActualType(rawPointer);
      var registeredPointerRecord = registeredPointers[actualType];
      if (!registeredPointerRecord) {
          return makeDefaultHandle.call(this);
      }
  
      var toType;
      if (this.isConst) {
          toType = registeredPointerRecord.constPointerType;
      } else {
          toType = registeredPointerRecord.pointerType;
      }
      var dp = downcastPointer(
          rawPointer,
          this.registeredClass,
          toType.registeredClass);
      if (dp === null) {
          return makeDefaultHandle.call(this);
      }
      if (this.isSmartPointer) {
          return makeClassHandle(toType.registeredClass.instancePrototype, {
              ptrType: toType,
              ptr: dp,
              smartPtrType: this,
              smartPtr: ptr,
          });
      } else {
          return makeClassHandle(toType.registeredClass.instancePrototype, {
              ptrType: toType,
              ptr: dp,
          });
      }
    }function init_RegisteredPointer() {
      RegisteredPointer.prototype.getPointee = RegisteredPointer_getPointee;
      RegisteredPointer.prototype.destructor = RegisteredPointer_destructor;
      RegisteredPointer.prototype['argPackAdvance'] = 8;
      RegisteredPointer.prototype['readValueFromPointer'] = simpleReadValueFromPointer;
      RegisteredPointer.prototype['deleteObject'] = RegisteredPointer_deleteObject;
      RegisteredPointer.prototype['fromWireType'] = RegisteredPointer_fromWireType;
    }function RegisteredPointer(
      name,
      registeredClass,
      isReference,
      isConst,
  
      // smart pointer properties
      isSmartPointer,
      pointeeType,
      sharingPolicy,
      rawGetPointee,
      rawConstructor,
      rawShare,
      rawDestructor
    ) {
      this.name = name;
      this.registeredClass = registeredClass;
      this.isReference = isReference;
      this.isConst = isConst;
  
      // smart pointer properties
      this.isSmartPointer = isSmartPointer;
      this.pointeeType = pointeeType;
      this.sharingPolicy = sharingPolicy;
      this.rawGetPointee = rawGetPointee;
      this.rawConstructor = rawConstructor;
      this.rawShare = rawShare;
      this.rawDestructor = rawDestructor;
  
      if (!isSmartPointer && registeredClass.baseClass === undefined) {
          if (isConst) {
              this['toWireType'] = constNoSmartPtrRawPointerToWireType;
              this.destructorFunction = null;
          } else {
              this['toWireType'] = nonConstNoSmartPtrRawPointerToWireType;
              this.destructorFunction = null;
          }
      } else {
          this['toWireType'] = genericPointerToWireType;
          // Here we must leave this.destructorFunction undefined, since whether genericPointerToWireType returns
          // a pointer that needs to be freed up is runtime-dependent, and cannot be evaluated at registration time.
          // TODO: Create an alternative mechanism that allows removing the use of var destructors = []; array in
          //       craftInvokerFunction altogether.
      }
    }
  
  function replacePublicSymbol(name, value, numArguments) {
      if (!Module.hasOwnProperty(name)) {
          throwInternalError('Replacing nonexistant public symbol');
      }
      // If there's an overload table for this symbol, replace the symbol in the overload table instead.
      if (undefined !== Module[name].overloadTable && undefined !== numArguments) {
          Module[name].overloadTable[numArguments] = value;
      }
      else {
          Module[name] = value;
          Module[name].argCount = numArguments;
      }
    }
  
  
  var UnboundTypeError=undefined;function throwUnboundTypeError(message, types) {
      var unboundTypes = [];
      var seen = {};
      function visit(type) {
          if (seen[type]) {
              return;
          }
          if (registeredTypes[type]) {
              return;
          }
          if (typeDependencies[type]) {
              typeDependencies[type].forEach(visit);
              return;
          }
          unboundTypes.push(type);
          seen[type] = true;
      }
      types.forEach(visit);
  
      throw new UnboundTypeError(message + ': ' + unboundTypes.map(getTypeName).join([', ']));
    }function __embind_register_class(
      rawType,
      rawPointerType,
      rawConstPointerType,
      baseClassRawType,
      getActualTypeSignature,
      getActualType,
      upcastSignature,
      upcast,
      downcastSignature,
      downcast,
      name,
      destructorSignature,
      rawDestructor
    ) {
      name = readLatin1String(name);
      getActualType = requireFunction(getActualTypeSignature, getActualType);
      if (upcast) {
          upcast = requireFunction(upcastSignature, upcast);
      }
      if (downcast) {
          downcast = requireFunction(downcastSignature, downcast);
      }
      rawDestructor = requireFunction(destructorSignature, rawDestructor);
      var legalFunctionName = makeLegalFunctionName(name);
  
      exposePublicSymbol(legalFunctionName, function() {
          // this code cannot run if baseClassRawType is zero
          throwUnboundTypeError('Cannot construct ' + name + ' due to unbound types', [baseClassRawType]);
      });
  
      whenDependentTypesAreResolved(
          [rawType, rawPointerType, rawConstPointerType],
          baseClassRawType ? [baseClassRawType] : [],
          function(base) {
              base = base[0];
  
              var baseClass;
              var basePrototype;
              if (baseClassRawType) {
                  baseClass = base.registeredClass;
                  basePrototype = baseClass.instancePrototype;
              } else {
                  basePrototype = ClassHandle.prototype;
              }
  
              var constructor = createNamedFunction(legalFunctionName, function() {
                  if (Object.getPrototypeOf(this) !== instancePrototype) {
                      throw new BindingError("Use 'new' to construct " + name);
                  }
                  if (undefined === registeredClass.constructor_body) {
                      throw new BindingError(name + " has no accessible constructor");
                  }
                  var body = registeredClass.constructor_body[arguments.length];
                  if (undefined === body) {
                      throw new BindingError("Tried to invoke ctor of " + name + " with invalid number of parameters (" + arguments.length + ") - expected (" + Object.keys(registeredClass.constructor_body).toString() + ") parameters instead!");
                  }
                  return body.apply(this, arguments);
              });
  
              var instancePrototype = Object.create(basePrototype, {
                  constructor: { value: constructor },
              });
  
              constructor.prototype = instancePrototype;
  
              var registeredClass = new RegisteredClass(
                  name,
                  constructor,
                  instancePrototype,
                  rawDestructor,
                  baseClass,
                  getActualType,
                  upcast,
                  downcast);
  
              var referenceConverter = new RegisteredPointer(
                  name,
                  registeredClass,
                  true,
                  false,
                  false);
  
              var pointerConverter = new RegisteredPointer(
                  name + '*',
                  registeredClass,
                  false,
                  false,
                  false);
  
              var constPointerConverter = new RegisteredPointer(
                  name + ' const*',
                  registeredClass,
                  false,
                  true,
                  false);
  
              registeredPointers[rawType] = {
                  pointerType: pointerConverter,
                  constPointerType: constPointerConverter
              };
  
              replacePublicSymbol(legalFunctionName, constructor);
  
              return [referenceConverter, pointerConverter, constPointerConverter];
          }
      );
    }

  function ___lock() {}

  function ___unlock() {}

  function __emval_decref(handle) {
      if (handle > 4 && 0 === --emval_handle_array[handle].refcount) {
          emval_handle_array[handle] = undefined;
          emval_free_list.push(handle);
      }
    }

  
  var PTHREAD_SPECIFIC={};function _pthread_getspecific(key) {
      return PTHREAD_SPECIFIC[key] || 0;
    }

  
  function runDestructors(destructors) {
      while (destructors.length) {
          var ptr = destructors.pop();
          var del = destructors.pop();
          del(ptr);
      }
    }function __embind_finalize_value_object(structType) {
      var reg = structRegistrations[structType];
      delete structRegistrations[structType];
  
      var rawConstructor = reg.rawConstructor;
      var rawDestructor = reg.rawDestructor;
      var fieldRecords = reg.fields;
      var fieldTypes = fieldRecords.map(function(field) { return field.getterReturnType; }).
                concat(fieldRecords.map(function(field) { return field.setterArgumentType; }));
      whenDependentTypesAreResolved([structType], fieldTypes, function(fieldTypes) {
          var fields = {};
          fieldRecords.forEach(function(field, i) {
              var fieldName = field.fieldName;
              var getterReturnType = fieldTypes[i];
              var getter = field.getter;
              var getterContext = field.getterContext;
              var setterArgumentType = fieldTypes[i + fieldRecords.length];
              var setter = field.setter;
              var setterContext = field.setterContext;
              fields[fieldName] = {
                  read: function(ptr) {
                      return getterReturnType['fromWireType'](
                          getter(getterContext, ptr));
                  },
                  write: function(ptr, o) {
                      var destructors = [];
                      setter(setterContext, ptr, setterArgumentType['toWireType'](destructors, o));
                      runDestructors(destructors);
                  }
              };
          });
  
          return [{
              name: reg.name,
              'fromWireType': function(ptr) {
                  var rv = {};
                  for (var i in fields) {
                      rv[i] = fields[i].read(ptr);
                  }
                  rawDestructor(ptr);
                  return rv;
              },
              'toWireType': function(destructors, o) {
                  // todo: Here we have an opportunity for -O3 level "unsafe" optimizations:
                  // assume all fields are present without checking.
                  for (var fieldName in fields) {
                      if (!(fieldName in o)) {
                          throw new TypeError('Missing field');
                      }
                  }
                  var ptr = rawConstructor();
                  for (fieldName in fields) {
                      fields[fieldName].write(ptr, o[fieldName]);
                  }
                  if (destructors !== null) {
                      destructors.push(rawDestructor, ptr);
                  }
                  return ptr;
              },
              'argPackAdvance': 8,
              'readValueFromPointer': simpleReadValueFromPointer,
              destructorFunction: rawDestructor,
          }];
      });
    }

  
  var PTHREAD_SPECIFIC_NEXT_KEY=1;
  
  var ERRNO_CODES={EPERM:1,ENOENT:2,ESRCH:3,EINTR:4,EIO:5,ENXIO:6,E2BIG:7,ENOEXEC:8,EBADF:9,ECHILD:10,EAGAIN:11,EWOULDBLOCK:11,ENOMEM:12,EACCES:13,EFAULT:14,ENOTBLK:15,EBUSY:16,EEXIST:17,EXDEV:18,ENODEV:19,ENOTDIR:20,EISDIR:21,EINVAL:22,ENFILE:23,EMFILE:24,ENOTTY:25,ETXTBSY:26,EFBIG:27,ENOSPC:28,ESPIPE:29,EROFS:30,EMLINK:31,EPIPE:32,EDOM:33,ERANGE:34,ENOMSG:42,EIDRM:43,ECHRNG:44,EL2NSYNC:45,EL3HLT:46,EL3RST:47,ELNRNG:48,EUNATCH:49,ENOCSI:50,EL2HLT:51,EDEADLK:35,ENOLCK:37,EBADE:52,EBADR:53,EXFULL:54,ENOANO:55,EBADRQC:56,EBADSLT:57,EDEADLOCK:35,EBFONT:59,ENOSTR:60,ENODATA:61,ETIME:62,ENOSR:63,ENONET:64,ENOPKG:65,EREMOTE:66,ENOLINK:67,EADV:68,ESRMNT:69,ECOMM:70,EPROTO:71,EMULTIHOP:72,EDOTDOT:73,EBADMSG:74,ENOTUNIQ:76,EBADFD:77,EREMCHG:78,ELIBACC:79,ELIBBAD:80,ELIBSCN:81,ELIBMAX:82,ELIBEXEC:83,ENOSYS:38,ENOTEMPTY:39,ENAMETOOLONG:36,ELOOP:40,EOPNOTSUPP:95,EPFNOSUPPORT:96,ECONNRESET:104,ENOBUFS:105,EAFNOSUPPORT:97,EPROTOTYPE:91,ENOTSOCK:88,ENOPROTOOPT:92,ESHUTDOWN:108,ECONNREFUSED:111,EADDRINUSE:98,ECONNABORTED:103,ENETUNREACH:101,ENETDOWN:100,ETIMEDOUT:110,EHOSTDOWN:112,EHOSTUNREACH:113,EINPROGRESS:115,EALREADY:114,EDESTADDRREQ:89,EMSGSIZE:90,EPROTONOSUPPORT:93,ESOCKTNOSUPPORT:94,EADDRNOTAVAIL:99,ENETRESET:102,EISCONN:106,ENOTCONN:107,ETOOMANYREFS:109,EUSERS:87,EDQUOT:122,ESTALE:116,ENOTSUP:95,ENOMEDIUM:123,EILSEQ:84,EOVERFLOW:75,ECANCELED:125,ENOTRECOVERABLE:131,EOWNERDEAD:130,ESTRPIPE:86};function _pthread_key_create(key, destructor) {
      if (key == 0) {
        return ERRNO_CODES.EINVAL;
      }
      HEAP32[((key)>>2)]=PTHREAD_SPECIFIC_NEXT_KEY;
      // values start at 0
      PTHREAD_SPECIFIC[PTHREAD_SPECIFIC_NEXT_KEY] = 0;
      PTHREAD_SPECIFIC_NEXT_KEY++;
      return 0;
    }

  function __emval_take_value(type, argv) {
      type = requireRegisteredType(type, '_emval_take_value');
      var v = type['readValueFromPointer'](argv);
      return __emval_register(v);
    }

  
  function _embind_repr(v) {
      if (v === null) {
          return 'null';
      }
      var t = typeof v;
      if (t === 'object' || t === 'array' || t === 'function') {
          return v.toString();
      } else {
          return '' + v;
      }
    }
  
  function integerReadValueFromPointer(name, shift, signed) {
      // integers are quite common, so generate very specialized functions
      switch (shift) {
          case 0: return signed ?
              function readS8FromPointer(pointer) { return HEAP8[pointer]; } :
              function readU8FromPointer(pointer) { return HEAPU8[pointer]; };
          case 1: return signed ?
              function readS16FromPointer(pointer) { return HEAP16[pointer >> 1]; } :
              function readU16FromPointer(pointer) { return HEAPU16[pointer >> 1]; };
          case 2: return signed ?
              function readS32FromPointer(pointer) { return HEAP32[pointer >> 2]; } :
              function readU32FromPointer(pointer) { return HEAPU32[pointer >> 2]; };
          default:
              throw new TypeError("Unknown integer type: " + name);
      }
    }function __embind_register_integer(primitiveType, name, size, minRange, maxRange) {
      name = readLatin1String(name);
      if (maxRange === -1) { // LLVM doesn't have signed and unsigned 32-bit types, so u32 literals come out as 'i32 -1'. Always treat those as max u32.
          maxRange = 4294967295;
      }
  
      var shift = getShiftFromSize(size);
      
      var fromWireType = function(value) {
          return value;
      };
      
      if (minRange === 0) {
          var bitshift = 32 - 8*size;
          fromWireType = function(value) {
              return (value << bitshift) >>> bitshift;
          };
      }
  
      registerType(primitiveType, {
          name: name,
          'fromWireType': fromWireType,
          'toWireType': function(destructors, value) {
              // todo: Here we have an opportunity for -O3 level "unsafe" optimizations: we could
              // avoid the following two if()s and assume value is of proper type.
              if (typeof value !== "number" && typeof value !== "boolean") {
                  throw new TypeError('Cannot convert "' + _embind_repr(value) + '" to ' + this.name);
              }
              if (value < minRange || value > maxRange) {
                  throw new TypeError('Passing a number "' + _embind_repr(value) + '" from JS side to C/C++ side to an argument of type "' + name + '", which is outside the valid range [' + minRange + ', ' + maxRange + ']!');
              }
              return value | 0;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': integerReadValueFromPointer(name, shift, minRange !== 0),
          destructorFunction: null, // This type does not need a destructor
      });
    }

  function __embind_register_emval(rawType, name) {
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': function(handle) {
              var rv = emval_handle_array[handle].value;
              __emval_decref(handle);
              return rv;
          },
          'toWireType': function(destructors, value) {
              return __emval_register(value);
          },
          'argPackAdvance': 8,
          'readValueFromPointer': simpleReadValueFromPointer,
          destructorFunction: null, // This type does not need a destructor
  
          // TODO: do we need a deleteObject here?  write a test where
          // emval is passed into JS via an interface
      });
    }

  function _pthread_setspecific(key, value) {
      if (!(key in PTHREAD_SPECIFIC)) {
        return ERRNO_CODES.EINVAL;
      }
      PTHREAD_SPECIFIC[key] = value;
      return 0;
    }

  function ___cxa_allocate_exception(size) {
      return _malloc(size);
    }

  
  var SYSCALLS={varargs:0,get:function (varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function () {
        var ret = Pointer_stringify(SYSCALLS.get());
        return ret;
      },get64:function () {
        var low = SYSCALLS.get(), high = SYSCALLS.get();
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low;
      },getZero:function () {
        assert(SYSCALLS.get() === 0);
      }};function ___syscall54(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // ioctl
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function __emval_set_property(handle, key, value) {
      handle = requireHandle(handle);
      key = requireHandle(key);
      value = requireHandle(value);
      handle[key] = value;
    }

  
  var tupleRegistrations={};function __embind_register_value_array(
      rawType,
      name,
      constructorSignature,
      rawConstructor,
      destructorSignature,
      rawDestructor
    ) {
      tupleRegistrations[rawType] = {
          name: readLatin1String(name),
          rawConstructor: requireFunction(constructorSignature, rawConstructor),
          rawDestructor: requireFunction(destructorSignature, rawDestructor),
          elements: [],
      };
    }

   
  Module["_bitshift64Lshr"] = _bitshift64Lshr;

  
  function heap32VectorToArray(count, firstElement) {
      var array = [];
      for (var i = 0; i < count; i++) {
          array.push(HEAP32[(firstElement >> 2) + i]);
      }
      return array;
    }function __embind_register_class_constructor(
      rawClassType,
      argCount,
      rawArgTypesAddr,
      invokerSignature,
      invoker,
      rawConstructor
    ) {
      var rawArgTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
      invoker = requireFunction(invokerSignature, invoker);
  
      whenDependentTypesAreResolved([], [rawClassType], function(classType) {
          classType = classType[0];
          var humanName = 'constructor ' + classType.name;
  
          if (undefined === classType.registeredClass.constructor_body) {
              classType.registeredClass.constructor_body = [];
          }
          if (undefined !== classType.registeredClass.constructor_body[argCount - 1]) {
              throw new BindingError("Cannot register multiple constructors with identical number of parameters (" + (argCount-1) + ") for class '" + classType.name + "'! Overload resolution is currently only performed using the parameter count, not actual type info!");
          }
          classType.registeredClass.constructor_body[argCount - 1] = function unboundTypeHandler() {
              throwUnboundTypeError('Cannot construct ' + classType.name + ' due to unbound types', rawArgTypes);
          };
  
          whenDependentTypesAreResolved([], rawArgTypes, function(argTypes) {
              classType.registeredClass.constructor_body[argCount - 1] = function constructor_body() {
                  if (arguments.length !== argCount - 1) {
                      throwBindingError(humanName + ' called with ' + arguments.length + ' arguments, expected ' + (argCount-1));
                  }
                  var destructors = [];
                  var args = new Array(argCount);
                  args[0] = rawConstructor;
                  for (var i = 1; i < argCount; ++i) {
                      args[i] = argTypes[i]['toWireType'](destructors, arguments[i - 1]);
                  }
  
                  var ptr = invoker.apply(null, args);
                  runDestructors(destructors);
  
                  return argTypes[0]['fromWireType'](ptr);
              };
              return [];
          });
          return [];
      });
    }

  
  function floatReadValueFromPointer(name, shift) {
      switch (shift) {
          case 2: return function(pointer) {
              return this['fromWireType'](HEAPF32[pointer >> 2]);
          };
          case 3: return function(pointer) {
              return this['fromWireType'](HEAPF64[pointer >> 3]);
          };
          default:
              throw new TypeError("Unknown float type: " + name);
      }
    }function __embind_register_float(rawType, name, size) {
      var shift = getShiftFromSize(size);
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': function(value) {
              return value;
          },
          'toWireType': function(destructors, value) {
              // todo: Here we have an opportunity for -O3 level "unsafe" optimizations: we could
              // avoid the following if() and assume value is of proper type.
              if (typeof value !== "number" && typeof value !== "boolean") {
                  throw new TypeError('Cannot convert "' + _embind_repr(value) + '" to ' + this.name);
              }
              return value;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': floatReadValueFromPointer(name, shift),
          destructorFunction: null, // This type does not need a destructor
      });
    }

  
  
  function new_(constructor, argumentList) {
      if (!(constructor instanceof Function)) {
          throw new TypeError('new_ called with constructor type ' + typeof(constructor) + " which is not a function");
      }
  
      /*
       * Previously, the following line was just:
  
       function dummy() {};
  
       * Unfortunately, Chrome was preserving 'dummy' as the object's name, even though at creation, the 'dummy' has the
       * correct constructor name.  Thus, objects created with IMVU.new would show up in the debugger as 'dummy', which
       * isn't very helpful.  Using IMVU.createNamedFunction addresses the issue.  Doublely-unfortunately, there's no way
       * to write a test for this behavior.  -NRD 2013.02.22
       */
      var dummy = createNamedFunction(constructor.name || 'unknownFunctionName', function(){});
      dummy.prototype = constructor.prototype;
      var obj = new dummy;
  
      var r = constructor.apply(obj, argumentList);
      return (r instanceof Object) ? r : obj;
    }function craftInvokerFunction(humanName, argTypes, classType, cppInvokerFunc, cppTargetFunc) {
      // humanName: a human-readable string name for the function to be generated.
      // argTypes: An array that contains the embind type objects for all types in the function signature.
      //    argTypes[0] is the type object for the function return value.
      //    argTypes[1] is the type object for function this object/class type, or null if not crafting an invoker for a class method.
      //    argTypes[2...] are the actual function parameters.
      // classType: The embind type object for the class to be bound, or null if this is not a method of a class.
      // cppInvokerFunc: JS Function object to the C++-side function that interops into C++ code.
      // cppTargetFunc: Function pointer (an integer to FUNCTION_TABLE) to the target C++ function the cppInvokerFunc will end up calling.
      var argCount = argTypes.length;
  
      if (argCount < 2) {
          throwBindingError("argTypes array size mismatch! Must at least get return value and 'this' types!");
      }
  
      var isClassMethodFunc = (argTypes[1] !== null && classType !== null);
  
      // Free functions with signature "void function()" do not need an invoker that marshalls between wire types.
  // TODO: This omits argument count check - enable only at -O3 or similar.
  //    if (ENABLE_UNSAFE_OPTS && argCount == 2 && argTypes[0].name == "void" && !isClassMethodFunc) {
  //       return FUNCTION_TABLE[fn];
  //    }
  
      var argsList = "";
      var argsListWired = "";
      for(var i = 0; i < argCount - 2; ++i) {
          argsList += (i!==0?", ":"")+"arg"+i;
          argsListWired += (i!==0?", ":"")+"arg"+i+"Wired";
      }
  
      var invokerFnBody =
          "return function "+makeLegalFunctionName(humanName)+"("+argsList+") {\n" +
          "if (arguments.length !== "+(argCount - 2)+") {\n" +
              "throwBindingError('function "+humanName+" called with ' + arguments.length + ' arguments, expected "+(argCount - 2)+" args!');\n" +
          "}\n";
  
  
      // Determine if we need to use a dynamic stack to store the destructors for the function parameters.
      // TODO: Remove this completely once all function invokers are being dynamically generated.
      var needsDestructorStack = false;
  
      for(var i = 1; i < argTypes.length; ++i) { // Skip return value at index 0 - it's not deleted here.
          if (argTypes[i] !== null && argTypes[i].destructorFunction === undefined) { // The type does not define a destructor function - must use dynamic stack
              needsDestructorStack = true;
              break;
          }
      }
  
      if (needsDestructorStack) {
          invokerFnBody +=
              "var destructors = [];\n";
      }
  
      var dtorStack = needsDestructorStack ? "destructors" : "null";
      var args1 = ["throwBindingError", "invoker", "fn", "runDestructors", "retType", "classParam"];
      var args2 = [throwBindingError, cppInvokerFunc, cppTargetFunc, runDestructors, argTypes[0], argTypes[1]];
  
  
      if (isClassMethodFunc) {
          invokerFnBody += "var thisWired = classParam.toWireType("+dtorStack+", this);\n";
      }
  
      for(var i = 0; i < argCount - 2; ++i) {
          invokerFnBody += "var arg"+i+"Wired = argType"+i+".toWireType("+dtorStack+", arg"+i+"); // "+argTypes[i+2].name+"\n";
          args1.push("argType"+i);
          args2.push(argTypes[i+2]);
      }
  
      if (isClassMethodFunc) {
          argsListWired = "thisWired" + (argsListWired.length > 0 ? ", " : "") + argsListWired;
      }
  
      var returns = (argTypes[0].name !== "void");
  
      invokerFnBody +=
          (returns?"var rv = ":"") + "invoker(fn"+(argsListWired.length>0?", ":"")+argsListWired+");\n";
  
      if (needsDestructorStack) {
          invokerFnBody += "runDestructors(destructors);\n";
      } else {
          for(var i = isClassMethodFunc?1:2; i < argTypes.length; ++i) { // Skip return value at index 0 - it's not deleted here. Also skip class type if not a method.
              var paramName = (i === 1 ? "thisWired" : ("arg"+(i - 2)+"Wired"));
              if (argTypes[i].destructorFunction !== null) {
                  invokerFnBody += paramName+"_dtor("+paramName+"); // "+argTypes[i].name+"\n";
                  args1.push(paramName+"_dtor");
                  args2.push(argTypes[i].destructorFunction);
              }
          }
      }
  
      if (returns) {
          invokerFnBody += "var ret = retType.fromWireType(rv);\n" +
                           "return ret;\n";
      } else {
      }
      invokerFnBody += "}\n";
  
      args1.push(invokerFnBody);
  
      var invokerFunction = new_(Function, args1).apply(null, args2);
      return invokerFunction;
    }function __embind_register_class_function(
      rawClassType,
      methodName,
      argCount,
      rawArgTypesAddr, // [ReturnType, ThisType, Args...]
      invokerSignature,
      rawInvoker,
      context,
      isPureVirtual
    ) {
      var rawArgTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
      methodName = readLatin1String(methodName);
      rawInvoker = requireFunction(invokerSignature, rawInvoker);
  
      whenDependentTypesAreResolved([], [rawClassType], function(classType) {
          classType = classType[0];
          var humanName = classType.name + '.' + methodName;
  
          if (isPureVirtual) {
              classType.registeredClass.pureVirtualFunctions.push(methodName);
          }
  
          function unboundTypesHandler() {
              throwUnboundTypeError('Cannot call ' + humanName + ' due to unbound types', rawArgTypes);
          }
  
          var proto = classType.registeredClass.instancePrototype;
          var method = proto[methodName];
          if (undefined === method || (undefined === method.overloadTable && method.className !== classType.name && method.argCount === argCount - 2)) {
              // This is the first overload to be registered, OR we are replacing a function in the base class with a function in the derived class.
              unboundTypesHandler.argCount = argCount - 2;
              unboundTypesHandler.className = classType.name;
              proto[methodName] = unboundTypesHandler;
          } else {
              // There was an existing function with the same name registered. Set up a function overload routing table.
              ensureOverloadTable(proto, methodName, humanName);
              proto[methodName].overloadTable[argCount - 2] = unboundTypesHandler;
          }
  
          whenDependentTypesAreResolved([], rawArgTypes, function(argTypes) {
  
              var memberFunction = craftInvokerFunction(humanName, argTypes, classType, rawInvoker, context);
  
              // Replace the initial unbound-handler-stub function with the appropriate member function, now that all types
              // are resolved. If multiple overloads are registered for this function, the function goes into an overload table.
              if (undefined === proto[methodName].overloadTable) {
                  // Set argCount in case an overload is registered later
                  memberFunction.argCount = argCount - 2;
                  proto[methodName] = memberFunction;
              } else {
                  proto[methodName].overloadTable[argCount - 2] = memberFunction;
              }
  
              return [];
          });
          return [];
      });
    }

  function __embind_finalize_value_array(rawTupleType) {
      var reg = tupleRegistrations[rawTupleType];
      delete tupleRegistrations[rawTupleType];
      var elements = reg.elements;
      var elementsLength = elements.length;
      var elementTypes = elements.map(function(elt) { return elt.getterReturnType; }).
                  concat(elements.map(function(elt) { return elt.setterArgumentType; }));
  
      var rawConstructor = reg.rawConstructor;
      var rawDestructor = reg.rawDestructor;
  
      whenDependentTypesAreResolved([rawTupleType], elementTypes, function(elementTypes) {
          elements.forEach(function(elt, i) {
              var getterReturnType = elementTypes[i];
              var getter = elt.getter;
              var getterContext = elt.getterContext;
              var setterArgumentType = elementTypes[i + elementsLength];
              var setter = elt.setter;
              var setterContext = elt.setterContext;
              elt.read = function(ptr) {
                  return getterReturnType['fromWireType'](getter(getterContext, ptr));
              };
              elt.write = function(ptr, o) {
                  var destructors = [];
                  setter(setterContext, ptr, setterArgumentType['toWireType'](destructors, o));
                  runDestructors(destructors);
              };
          });
  
          return [{
              name: reg.name,
              'fromWireType': function(ptr) {
                  var rv = new Array(elementsLength);
                  for (var i = 0; i < elementsLength; ++i) {
                      rv[i] = elements[i].read(ptr);
                  }
                  rawDestructor(ptr);
                  return rv;
              },
              'toWireType': function(destructors, o) {
                  if (elementsLength !== o.length) {
                      throw new TypeError("Incorrect number of tuple elements for " + reg.name + ": expected=" + elementsLength + ", actual=" + o.length);
                  }
                  var ptr = rawConstructor();
                  for (var i = 0; i < elementsLength; ++i) {
                      elements[i].write(ptr, o[i]);
                  }
                  if (destructors !== null) {
                      destructors.push(rawDestructor, ptr);
                  }
                  return ptr;
              },
              'argPackAdvance': 8,
              'readValueFromPointer': simpleReadValueFromPointer,
              destructorFunction: rawDestructor,
          }];
      });
    }

  function __embind_register_function(name, argCount, rawArgTypesAddr, signature, rawInvoker, fn) {
      var argTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
      name = readLatin1String(name);
      
      rawInvoker = requireFunction(signature, rawInvoker);
  
      exposePublicSymbol(name, function() {
          throwUnboundTypeError('Cannot call ' + name + ' due to unbound types', argTypes);
      }, argCount - 1);
  
      whenDependentTypesAreResolved([], argTypes, function(argTypes) {
          var invokerArgsArray = [argTypes[0] /* return value */, null /* no class 'this'*/].concat(argTypes.slice(1) /* actual params */);
          replacePublicSymbol(name, craftInvokerFunction(name, invokerArgsArray, null /* no class 'this'*/, rawInvoker, fn), argCount - 1);
          return [];
      });
    }

  function ___cxa_find_matching_catch_2() {
          return ___cxa_find_matching_catch.apply(null, arguments);
        }

  function ___cxa_find_matching_catch_3() {
          return ___cxa_find_matching_catch.apply(null, arguments);
        }

  function ___cxa_begin_catch(ptr) {
      var info = EXCEPTIONS.infos[ptr];
      if (info && !info.caught) {
        info.caught = true;
        __ZSt18uncaught_exceptionv.uncaught_exception--;
      }
      if (info) info.rethrown = false;
      EXCEPTIONS.caught.push(ptr);
      EXCEPTIONS.addRef(EXCEPTIONS.deAdjust(ptr));
      return ptr;
    }

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    } 
  Module["_memcpy"] = _memcpy;

  function ___syscall6(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // close
      var stream = SYSCALLS.getStreamFromFD();
      FS.close(stream);
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  
  
  var cttz_i8 = allocate([8,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,7,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0], "i8", ALLOC_STATIC); 
  Module["_llvm_cttz_i32"] = _llvm_cttz_i32; 
  Module["___udivmoddi4"] = ___udivmoddi4; 
  Module["___udivdi3"] = ___udivdi3;

  function __embind_register_value_array_element(
      rawTupleType,
      getterReturnType,
      getterSignature,
      getter,
      getterContext,
      setterArgumentType,
      setterSignature,
      setter,
      setterContext
    ) {
      tupleRegistrations[rawTupleType].elements.push({
          getterReturnType: getterReturnType,
          getter: requireFunction(getterSignature, getter),
          getterContext: getterContext,
          setterArgumentType: setterArgumentType,
          setter: requireFunction(setterSignature, setter),
          setterContext: setterContext,
      });
    }

  
  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      else Module.printErr('failed to set errno from JS');
      return value;
    } 
  Module["_sbrk"] = _sbrk;

   
  Module["_memmove"] = _memmove;

  function __embind_register_std_wstring(rawType, charSize, name) {
      // nb. do not cache HEAPU16 and HEAPU32, they may be destroyed by enlargeMemory().
      name = readLatin1String(name);
      var getHeap, shift;
      if (charSize === 2) {
          getHeap = function() { return HEAPU16; };
          shift = 1;
      } else if (charSize === 4) {
          getHeap = function() { return HEAPU32; };
          shift = 2;
      }
      registerType(rawType, {
          name: name,
          'fromWireType': function(value) {
              var HEAP = getHeap();
              var length = HEAPU32[value >> 2];
              var a = new Array(length);
              var start = (value + 4) >> shift;
              for (var i = 0; i < length; ++i) {
                  a[i] = String.fromCharCode(HEAP[start + i]);
              }
              _free(value);
              return a.join('');
          },
          'toWireType': function(destructors, value) {
              // assumes 4-byte alignment
              var HEAP = getHeap();
              var length = value.length;
              var ptr = _malloc(4 + length * charSize);
              HEAPU32[ptr >> 2] = length;
              var start = (ptr + 4) >> shift;
              for (var i = 0; i < length; ++i) {
                  HEAP[start + i] = value.charCodeAt(i);
              }
              if (destructors !== null) {
                  destructors.push(_free, ptr);
              }
              return ptr;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': simpleReadValueFromPointer,
          destructorFunction: function(ptr) { _free(ptr); },
      });
    }

  function ___gxx_personality_v0() {
    }

   
  Module["___uremdi3"] = ___uremdi3;

  
  
  var emval_symbols={};function getStringOrSymbol(address) {
      var symbol = emval_symbols[address];
      if (symbol === undefined) {
          return readLatin1String(address);
      } else {
          return symbol;
      }
    }
  
  function emval_get_global() { return (function(){return Function;})()('return this')(); }function __emval_get_global(name) {
      if(name===0){
        return __emval_register(emval_get_global());
      } else {
        name = getStringOrSymbol(name);
        return __emval_register(emval_get_global()[name]);
      }
    }

  function _abort() {
      Module['abort']();
    }

   
  Module["_llvm_bswap_i32"] = _llvm_bswap_i32;

  function __embind_register_memory_view(rawType, dataTypeIndex, name) {
      var typeMapping = [
          Int8Array,
          Uint8Array,
          Int16Array,
          Uint16Array,
          Int32Array,
          Uint32Array,
          Float32Array,
          Float64Array,
      ];
  
      var TA = typeMapping[dataTypeIndex];
  
      function decodeMemoryView(handle) {
          handle = handle >> 2;
          var heap = HEAPU32;
          var size = heap[handle]; // in elements
          var data = heap[handle + 1]; // byte offset into emscripten heap
          return new TA(heap['buffer'], data, size);
      }
  
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': decodeMemoryView,
          'argPackAdvance': 8,
          'readValueFromPointer': decodeMemoryView,
      }, {
          ignoreDuplicateRegistrations: true,
      });
    }


  function ___syscall140(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // llseek
      var stream = SYSCALLS.getStreamFromFD(), offset_high = SYSCALLS.get(), offset_low = SYSCALLS.get(), result = SYSCALLS.get(), whence = SYSCALLS.get();
      var offset = offset_low;
      assert(offset_high === 0);
      FS.llseek(stream, offset, whence);
      HEAP32[((result)>>2)]=stream.position;
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null; // reset readdir state
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function __emval_incref(handle) {
      if (handle > 4) {
          emval_handle_array[handle].refcount += 1;
      }
    }

  function ___syscall146(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // writev
      // hack to support printf in NO_FILESYSTEM
      var stream = SYSCALLS.get(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      var ret = 0;
      if (!___syscall146.buffer) {
        ___syscall146.buffers = [null, [], []]; // 1 => stdout, 2 => stderr
        ___syscall146.printChar = function(stream, curr) {
          var buffer = ___syscall146.buffers[stream];
          assert(buffer);
          if (curr === 0 || curr === 10) {
            (stream === 1 ? Module['print'] : Module['printErr'])(UTF8ArrayToString(buffer, 0));
            buffer.length = 0;
          } else {
            buffer.push(curr);
          }
        };
      }
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAP32[(((iov)+(i*8))>>2)];
        var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
        for (var j = 0; j < len; j++) {
          ___syscall146.printChar(stream, HEAPU8[ptr+j]);
        }
        ret += len;
      }
      return ret;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___cxa_end_catch() {
      // Clear state flag.
      Module['setThrew'](0);
      // Call destructor if one is registered then clear it.
      var ptr = EXCEPTIONS.caught.pop();
      if (ptr) {
        EXCEPTIONS.decRef(EXCEPTIONS.deAdjust(ptr));
        EXCEPTIONS.last = 0; // XXX in decRef?
      }
    }

  var ___dso_handle=STATICTOP; STATICTOP += 16;;
embind_init_charCodes();
BindingError = Module['BindingError'] = extendError(Error, 'BindingError');;
InternalError = Module['InternalError'] = extendError(Error, 'InternalError');;
init_emval();;
init_ClassHandle();
init_RegisteredPointer();
init_embind();;
UnboundTypeError = Module['UnboundTypeError'] = extendError(Error, 'UnboundTypeError');;
/* flush anything remaining in the buffer during shutdown */ __ATEXIT__.push(function() { var fflush = Module["_fflush"]; if (fflush) fflush(0); var printChar = ___syscall146.printChar; if (!printChar) return; var buffers = ___syscall146.buffers; if (buffers[1].length) printChar(1, 10); if (buffers[2].length) printChar(2, 10); });;
DYNAMICTOP_PTR = allocate(1, "i32", ALLOC_STATIC);

STACK_BASE = STACKTOP = Runtime.alignMemory(STATICTOP);

STACK_MAX = STACK_BASE + TOTAL_STACK;

DYNAMIC_BASE = Runtime.alignMemory(STACK_MAX);

HEAP32[DYNAMICTOP_PTR>>2] = DYNAMIC_BASE;

staticSealed = true; // seal the static portion of memory

assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");



function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_i(x) { Module["printErr"]("Invalid function pointer called with signature 'i'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vi(x) { Module["printErr"]("Invalid function pointer called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vii(x) { Module["printErr"]("Invalid function pointer called with signature 'vii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viii(x) { Module["printErr"]("Invalid function pointer called with signature 'viii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_v(x) { Module["printErr"]("Invalid function pointer called with signature 'v'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'iiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iii(x) { Module["printErr"]("Invalid function pointer called with signature 'iii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'iiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function invoke_iiii(index,a1,a2,a3) {
  try {
    return Module["dynCall_iiii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiiii(index,a1,a2,a3,a4,a5) {
  try {
    Module["dynCall_viiiii"](index,a1,a2,a3,a4,a5);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_i(index) {
  try {
    return Module["dynCall_i"](index);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_vi(index,a1) {
  try {
    Module["dynCall_vi"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_vii(index,a1,a2) {
  try {
    Module["dynCall_vii"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_ii(index,a1) {
  try {
    return Module["dynCall_ii"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viii(index,a1,a2,a3) {
  try {
    Module["dynCall_viii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_v(index) {
  try {
    Module["dynCall_v"](index);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iiiii(index,a1,a2,a3,a4) {
  try {
    return Module["dynCall_iiiii"](index,a1,a2,a3,a4);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiiiii(index,a1,a2,a3,a4,a5,a6) {
  try {
    Module["dynCall_viiiiii"](index,a1,a2,a3,a4,a5,a6);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iii(index,a1,a2) {
  try {
    return Module["dynCall_iii"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iiiiii(index,a1,a2,a3,a4,a5) {
  try {
    return Module["dynCall_iiiiii"](index,a1,a2,a3,a4,a5);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiii(index,a1,a2,a3,a4) {
  try {
    Module["dynCall_viiii"](index,a1,a2,a3,a4);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

Module.asmGlobalArg = { "Math": Math, "Int8Array": Int8Array, "Int16Array": Int16Array, "Int32Array": Int32Array, "Uint8Array": Uint8Array, "Uint16Array": Uint16Array, "Uint32Array": Uint32Array, "Float32Array": Float32Array, "Float64Array": Float64Array, "NaN": NaN, "Infinity": Infinity, "byteLength": byteLength };

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_iiii": nullFunc_iiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_i": nullFunc_i, "nullFunc_vi": nullFunc_vi, "nullFunc_vii": nullFunc_vii, "nullFunc_ii": nullFunc_ii, "nullFunc_viii": nullFunc_viii, "nullFunc_v": nullFunc_v, "nullFunc_iiiii": nullFunc_iiiii, "nullFunc_viiiiii": nullFunc_viiiiii, "nullFunc_iii": nullFunc_iii, "nullFunc_iiiiii": nullFunc_iiiiii, "nullFunc_viiii": nullFunc_viiii, "invoke_iiii": invoke_iiii, "invoke_viiiii": invoke_viiiii, "invoke_i": invoke_i, "invoke_vi": invoke_vi, "invoke_vii": invoke_vii, "invoke_ii": invoke_ii, "invoke_viii": invoke_viii, "invoke_v": invoke_v, "invoke_iiiii": invoke_iiiii, "invoke_viiiiii": invoke_viiiiii, "invoke_iii": invoke_iii, "invoke_iiiiii": invoke_iiiiii, "invoke_viiii": invoke_viiii, "floatReadValueFromPointer": floatReadValueFromPointer, "simpleReadValueFromPointer": simpleReadValueFromPointer, "throwInternalError": throwInternalError, "get_first_emval": get_first_emval, "__emval_set_property": __emval_set_property, "getLiveInheritedInstances": getLiveInheritedInstances, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "ClassHandle": ClassHandle, "getShiftFromSize": getShiftFromSize, "___cxa_begin_catch": ___cxa_begin_catch, "_emscripten_memcpy_big": _emscripten_memcpy_big, "runDestructor": runDestructor, "throwInstanceAlreadyDeleted": throwInstanceAlreadyDeleted, "__embind_register_std_string": __embind_register_std_string, "__emval_get_global": __emval_get_global, "init_RegisteredPointer": init_RegisteredPointer, "ClassHandle_isAliasOf": ClassHandle_isAliasOf, "flushPendingDeletes": flushPendingDeletes, "makeClassHandle": makeClassHandle, "whenDependentTypesAreResolved": whenDependentTypesAreResolved, "__embind_register_class_constructor": __embind_register_class_constructor, "___cxa_atexit": ___cxa_atexit, "__embind_finalize_value_array": __embind_finalize_value_array, "init_ClassHandle": init_ClassHandle, "___syscall140": ___syscall140, "ClassHandle_clone": ClassHandle_clone, "___syscall146": ___syscall146, "craftEmvalAllocator": craftEmvalAllocator, "throwBindingError": throwBindingError, "RegisteredClass": RegisteredClass, "___cxa_free_exception": ___cxa_free_exception, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "__embind_register_value_object_field": __embind_register_value_object_field, "embind_init_charCodes": embind_init_charCodes, "___setErrNo": ___setErrNo, "__embind_register_bool": __embind_register_bool, "___resumeException": ___resumeException, "createNamedFunction": createNamedFunction, "__embind_register_emval": __embind_register_emval, "__embind_finalize_value_object": __embind_finalize_value_object, "__emval_decref": __emval_decref, "_pthread_once": _pthread_once, "__embind_register_class": __embind_register_class, "constNoSmartPtrRawPointerToWireType": constNoSmartPtrRawPointerToWireType, "heap32VectorToArray": heap32VectorToArray, "ClassHandle_delete": ClassHandle_delete, "getStringOrSymbol": getStringOrSymbol, "RegisteredPointer_destructor": RegisteredPointer_destructor, "___syscall6": ___syscall6, "ensureOverloadTable": ensureOverloadTable, "new_": new_, "downcastPointer": downcastPointer, "replacePublicSymbol": replacePublicSymbol, "init_embind": init_embind, "ClassHandle_deleteLater": ClassHandle_deleteLater, "integerReadValueFromPointer": integerReadValueFromPointer, "RegisteredPointer_deleteObject": RegisteredPointer_deleteObject, "ClassHandle_isDeleted": ClassHandle_isDeleted, "__embind_register_integer": __embind_register_integer, "___cxa_allocate_exception": ___cxa_allocate_exception, "__emval_take_value": __emval_take_value, "___cxa_end_catch": ___cxa_end_catch, "__embind_register_value_object": __embind_register_value_object, "_embind_repr": _embind_repr, "_pthread_getspecific": _pthread_getspecific, "throwUnboundTypeError": throwUnboundTypeError, "craftInvokerFunction": craftInvokerFunction, "runDestructors": runDestructors, "requireRegisteredType": requireRegisteredType, "makeLegalFunctionName": makeLegalFunctionName, "_pthread_key_create": _pthread_key_create, "upcastPointer": upcastPointer, "_pthread_setspecific": _pthread_setspecific, "init_emval": init_emval, "shallowCopyInternalPointer": shallowCopyInternalPointer, "nonConstNoSmartPtrRawPointerToWireType": nonConstNoSmartPtrRawPointerToWireType, "__embind_register_value_array": __embind_register_value_array, "_abort": _abort, "requireHandle": requireHandle, "getTypeName": getTypeName, "exposePublicSymbol": exposePublicSymbol, "RegisteredPointer_fromWireType": RegisteredPointer_fromWireType, "___lock": ___lock, "__embind_register_value_array_element": __embind_register_value_array_element, "__embind_register_memory_view": __embind_register_memory_view, "getInheritedInstance": getInheritedInstance, "setDelayFunction": setDelayFunction, "___gxx_personality_v0": ___gxx_personality_v0, "extendError": extendError, "__embind_register_void": __embind_register_void, "___cxa_find_matching_catch_3": ___cxa_find_matching_catch_3, "__embind_register_function": __embind_register_function, "RegisteredPointer_getPointee": RegisteredPointer_getPointee, "__emval_register": __emval_register, "___cxa_find_matching_catch_2": ___cxa_find_matching_catch_2, "__embind_register_class_function": __embind_register_class_function, "__emval_incref": __emval_incref, "RegisteredPointer": RegisteredPointer, "readLatin1String": readLatin1String, "getBasestPointer": getBasestPointer, "getInheritedInstanceCount": getInheritedInstanceCount, "__embind_register_float": __embind_register_float, "___syscall54": ___syscall54, "___unlock": ___unlock, "__embind_register_std_wstring": __embind_register_std_wstring, "__emval_new": __emval_new, "emval_get_global": emval_get_global, "genericPointerToWireType": genericPointerToWireType, "registerType": registerType, "___cxa_throw": ___cxa_throw, "count_emval_handles": count_emval_handles, "requireFunction": requireFunction, "_atexit": _atexit, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8, "___dso_handle": ___dso_handle };
// EMSCRIPTEN_START_ASM
var asm = (function(global, env, buffer) {
  'almost asm';
  
  
  var Int8View = global.Int8Array;
  var Int16View = global.Int16Array;
  var Int32View = global.Int32Array;
  var Uint8View = global.Uint8Array;
  var Uint16View = global.Uint16Array;
  var Uint32View = global.Uint32Array;
  var Float32View = global.Float32Array;
  var Float64View = global.Float64Array;
  var HEAP8 = new Int8View(buffer);
  var HEAP16 = new Int16View(buffer);
  var HEAP32 = new Int32View(buffer);
  var HEAPU8 = new Uint8View(buffer);
  var HEAPU16 = new Uint16View(buffer);
  var HEAPU32 = new Uint32View(buffer);
  var HEAPF32 = new Float32View(buffer);
  var HEAPF64 = new Float64View(buffer);
  var byteLength = global.byteLength;


  var DYNAMICTOP_PTR=env.DYNAMICTOP_PTR|0;
  var tempDoublePtr=env.tempDoublePtr|0;
  var ABORT=env.ABORT|0;
  var STACKTOP=env.STACKTOP|0;
  var STACK_MAX=env.STACK_MAX|0;
  var cttz_i8=env.cttz_i8|0;
  var ___dso_handle=env.___dso_handle|0;

  var __THREW__ = 0;
  var threwValue = 0;
  var setjmpId = 0;
  var undef = 0;
  var nan = global.NaN, inf = global.Infinity;
  var tempInt = 0, tempBigInt = 0, tempBigIntP = 0, tempBigIntS = 0, tempBigIntR = 0.0, tempBigIntI = 0, tempBigIntD = 0, tempValue = 0, tempDouble = 0.0;
  var tempRet0 = 0;

  var Math_floor=global.Math.floor;
  var Math_abs=global.Math.abs;
  var Math_sqrt=global.Math.sqrt;
  var Math_pow=global.Math.pow;
  var Math_cos=global.Math.cos;
  var Math_sin=global.Math.sin;
  var Math_tan=global.Math.tan;
  var Math_acos=global.Math.acos;
  var Math_asin=global.Math.asin;
  var Math_atan=global.Math.atan;
  var Math_atan2=global.Math.atan2;
  var Math_exp=global.Math.exp;
  var Math_log=global.Math.log;
  var Math_ceil=global.Math.ceil;
  var Math_imul=global.Math.imul;
  var Math_min=global.Math.min;
  var Math_max=global.Math.max;
  var Math_clz32=global.Math.clz32;
  var abort=env.abort;
  var assert=env.assert;
  var enlargeMemory=env.enlargeMemory;
  var getTotalMemory=env.getTotalMemory;
  var abortOnCannotGrowMemory=env.abortOnCannotGrowMemory;
  var abortStackOverflow=env.abortStackOverflow;
  var nullFunc_iiii=env.nullFunc_iiii;
  var nullFunc_viiiii=env.nullFunc_viiiii;
  var nullFunc_i=env.nullFunc_i;
  var nullFunc_vi=env.nullFunc_vi;
  var nullFunc_vii=env.nullFunc_vii;
  var nullFunc_ii=env.nullFunc_ii;
  var nullFunc_viii=env.nullFunc_viii;
  var nullFunc_v=env.nullFunc_v;
  var nullFunc_iiiii=env.nullFunc_iiiii;
  var nullFunc_viiiiii=env.nullFunc_viiiiii;
  var nullFunc_iii=env.nullFunc_iii;
  var nullFunc_iiiiii=env.nullFunc_iiiiii;
  var nullFunc_viiii=env.nullFunc_viiii;
  var invoke_iiii=env.invoke_iiii;
  var invoke_viiiii=env.invoke_viiiii;
  var invoke_i=env.invoke_i;
  var invoke_vi=env.invoke_vi;
  var invoke_vii=env.invoke_vii;
  var invoke_ii=env.invoke_ii;
  var invoke_viii=env.invoke_viii;
  var invoke_v=env.invoke_v;
  var invoke_iiiii=env.invoke_iiiii;
  var invoke_viiiiii=env.invoke_viiiiii;
  var invoke_iii=env.invoke_iii;
  var invoke_iiiiii=env.invoke_iiiiii;
  var invoke_viiii=env.invoke_viiii;
  var floatReadValueFromPointer=env.floatReadValueFromPointer;
  var simpleReadValueFromPointer=env.simpleReadValueFromPointer;
  var throwInternalError=env.throwInternalError;
  var get_first_emval=env.get_first_emval;
  var __emval_set_property=env.__emval_set_property;
  var getLiveInheritedInstances=env.getLiveInheritedInstances;
  var __ZSt18uncaught_exceptionv=env.__ZSt18uncaught_exceptionv;
  var ClassHandle=env.ClassHandle;
  var getShiftFromSize=env.getShiftFromSize;
  var ___cxa_begin_catch=env.___cxa_begin_catch;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var runDestructor=env.runDestructor;
  var throwInstanceAlreadyDeleted=env.throwInstanceAlreadyDeleted;
  var __embind_register_std_string=env.__embind_register_std_string;
  var __emval_get_global=env.__emval_get_global;
  var init_RegisteredPointer=env.init_RegisteredPointer;
  var ClassHandle_isAliasOf=env.ClassHandle_isAliasOf;
  var flushPendingDeletes=env.flushPendingDeletes;
  var makeClassHandle=env.makeClassHandle;
  var whenDependentTypesAreResolved=env.whenDependentTypesAreResolved;
  var __embind_register_class_constructor=env.__embind_register_class_constructor;
  var ___cxa_atexit=env.___cxa_atexit;
  var __embind_finalize_value_array=env.__embind_finalize_value_array;
  var init_ClassHandle=env.init_ClassHandle;
  var ___syscall140=env.___syscall140;
  var ClassHandle_clone=env.ClassHandle_clone;
  var ___syscall146=env.___syscall146;
  var craftEmvalAllocator=env.craftEmvalAllocator;
  var throwBindingError=env.throwBindingError;
  var RegisteredClass=env.RegisteredClass;
  var ___cxa_free_exception=env.___cxa_free_exception;
  var ___cxa_find_matching_catch=env.___cxa_find_matching_catch;
  var __embind_register_value_object_field=env.__embind_register_value_object_field;
  var embind_init_charCodes=env.embind_init_charCodes;
  var ___setErrNo=env.___setErrNo;
  var __embind_register_bool=env.__embind_register_bool;
  var ___resumeException=env.___resumeException;
  var createNamedFunction=env.createNamedFunction;
  var __embind_register_emval=env.__embind_register_emval;
  var __embind_finalize_value_object=env.__embind_finalize_value_object;
  var __emval_decref=env.__emval_decref;
  var _pthread_once=env._pthread_once;
  var __embind_register_class=env.__embind_register_class;
  var constNoSmartPtrRawPointerToWireType=env.constNoSmartPtrRawPointerToWireType;
  var heap32VectorToArray=env.heap32VectorToArray;
  var ClassHandle_delete=env.ClassHandle_delete;
  var getStringOrSymbol=env.getStringOrSymbol;
  var RegisteredPointer_destructor=env.RegisteredPointer_destructor;
  var ___syscall6=env.___syscall6;
  var ensureOverloadTable=env.ensureOverloadTable;
  var new_=env.new_;
  var downcastPointer=env.downcastPointer;
  var replacePublicSymbol=env.replacePublicSymbol;
  var init_embind=env.init_embind;
  var ClassHandle_deleteLater=env.ClassHandle_deleteLater;
  var integerReadValueFromPointer=env.integerReadValueFromPointer;
  var RegisteredPointer_deleteObject=env.RegisteredPointer_deleteObject;
  var ClassHandle_isDeleted=env.ClassHandle_isDeleted;
  var __embind_register_integer=env.__embind_register_integer;
  var ___cxa_allocate_exception=env.___cxa_allocate_exception;
  var __emval_take_value=env.__emval_take_value;
  var ___cxa_end_catch=env.___cxa_end_catch;
  var __embind_register_value_object=env.__embind_register_value_object;
  var _embind_repr=env._embind_repr;
  var _pthread_getspecific=env._pthread_getspecific;
  var throwUnboundTypeError=env.throwUnboundTypeError;
  var craftInvokerFunction=env.craftInvokerFunction;
  var runDestructors=env.runDestructors;
  var requireRegisteredType=env.requireRegisteredType;
  var makeLegalFunctionName=env.makeLegalFunctionName;
  var _pthread_key_create=env._pthread_key_create;
  var upcastPointer=env.upcastPointer;
  var _pthread_setspecific=env._pthread_setspecific;
  var init_emval=env.init_emval;
  var shallowCopyInternalPointer=env.shallowCopyInternalPointer;
  var nonConstNoSmartPtrRawPointerToWireType=env.nonConstNoSmartPtrRawPointerToWireType;
  var __embind_register_value_array=env.__embind_register_value_array;
  var _abort=env._abort;
  var requireHandle=env.requireHandle;
  var getTypeName=env.getTypeName;
  var exposePublicSymbol=env.exposePublicSymbol;
  var RegisteredPointer_fromWireType=env.RegisteredPointer_fromWireType;
  var ___lock=env.___lock;
  var __embind_register_value_array_element=env.__embind_register_value_array_element;
  var __embind_register_memory_view=env.__embind_register_memory_view;
  var getInheritedInstance=env.getInheritedInstance;
  var setDelayFunction=env.setDelayFunction;
  var ___gxx_personality_v0=env.___gxx_personality_v0;
  var extendError=env.extendError;
  var __embind_register_void=env.__embind_register_void;
  var ___cxa_find_matching_catch_3=env.___cxa_find_matching_catch_3;
  var __embind_register_function=env.__embind_register_function;
  var RegisteredPointer_getPointee=env.RegisteredPointer_getPointee;
  var __emval_register=env.__emval_register;
  var ___cxa_find_matching_catch_2=env.___cxa_find_matching_catch_2;
  var __embind_register_class_function=env.__embind_register_class_function;
  var __emval_incref=env.__emval_incref;
  var RegisteredPointer=env.RegisteredPointer;
  var readLatin1String=env.readLatin1String;
  var getBasestPointer=env.getBasestPointer;
  var getInheritedInstanceCount=env.getInheritedInstanceCount;
  var __embind_register_float=env.__embind_register_float;
  var ___syscall54=env.___syscall54;
  var ___unlock=env.___unlock;
  var __embind_register_std_wstring=env.__embind_register_std_wstring;
  var __emval_new=env.__emval_new;
  var emval_get_global=env.emval_get_global;
  var genericPointerToWireType=env.genericPointerToWireType;
  var registerType=env.registerType;
  var ___cxa_throw=env.___cxa_throw;
  var count_emval_handles=env.count_emval_handles;
  var requireFunction=env.requireFunction;
  var _atexit=env._atexit;
  var tempFloat = 0.0;

function _emscripten_replace_memory(newBuffer) {
  if ((byteLength(newBuffer) & 0xffffff || byteLength(newBuffer) <= 0xffffff) || byteLength(newBuffer) > 0x80000000) return false;
  HEAP8 = new Int8View(newBuffer);
  HEAP16 = new Int16View(newBuffer);
  HEAP32 = new Int32View(newBuffer);
  HEAPU8 = new Uint8View(newBuffer);
  HEAPU16 = new Uint16View(newBuffer);
  HEAPU32 = new Uint32View(newBuffer);
  HEAPF32 = new Float32View(newBuffer);
  HEAPF64 = new Float64View(newBuffer);
  buffer = newBuffer;
  return true;
}

// EMSCRIPTEN_START_FUNCS

function stackAlloc(size) {
  size = size|0;
  var ret = 0;
  ret = STACKTOP;
  STACKTOP = (STACKTOP + size)|0;
  STACKTOP = (STACKTOP + 15)&-16;
  if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(size|0);

  return ret|0;
}
function stackSave() {
  return STACKTOP|0;
}
function stackRestore(top) {
  top = top|0;
  STACKTOP = top;
}
function establishStackSpace(stackBase, stackMax) {
  stackBase = stackBase|0;
  stackMax = stackMax|0;
  STACKTOP = stackBase;
  STACK_MAX = stackMax;
}

function setThrew(threw, value) {
  threw = threw|0;
  value = value|0;
  if ((__THREW__|0) == 0) {
    __THREW__ = threw;
    threwValue = value;
  }
}

function setTempRet0(value) {
  value = value|0;
  tempRet0 = value;
}
function getTempRet0() {
  return tempRet0|0;
}

function __Z7getFace4Vec34Side($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0;
 var $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0;
 var $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0;
 var $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0;
 var $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0;
 var $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0;
 var $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0;
 var $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0;
 var $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0;
 var $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0;
 var $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0;
 var $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0;
 var $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0;
 var $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0;
 var $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0;
 var $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0;
 var $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0;
 var $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0, $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0;
 var $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0;
 var $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0;
 var $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0;
 var $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0, $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0;
 var $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0, $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0;
 var $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0;
 var $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 800|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(800|0);
 $11 = sp + 760|0;
 $14 = sp + 748|0;
 $20 = sp + 40|0;
 $29 = sp + 692|0;
 $32 = sp + 680|0;
 $38 = sp + 32|0;
 $47 = sp + 624|0;
 $50 = sp + 612|0;
 $56 = sp + 24|0;
 $65 = sp + 556|0;
 $68 = sp + 544|0;
 $74 = sp + 16|0;
 $83 = sp + 488|0;
 $86 = sp + 476|0;
 $92 = sp + 8|0;
 $101 = sp + 420|0;
 $104 = sp + 408|0;
 $110 = sp;
 $112 = sp + 376|0;
 $113 = sp + 328|0;
 $114 = sp + 320|0;
 $115 = sp + 272|0;
 $116 = sp + 264|0;
 $117 = sp + 216|0;
 $118 = sp + 208|0;
 $119 = sp + 160|0;
 $120 = sp + 152|0;
 $121 = sp + 104|0;
 $122 = sp + 96|0;
 $123 = sp + 48|0;
 $111 = $2;
 $124 = $111;
 switch ($124|0) {
 case 0:  {
  $125 = HEAP32[$1>>2]|0;
  $126 = (1 + ($125))|0;
  HEAP32[$113>>2] = $126;
  $127 = ((($113)) + 4|0);
  $128 = ((($1)) + 4|0);
  $129 = HEAP32[$128>>2]|0;
  $130 = (0 + ($129))|0;
  HEAP32[$127>>2] = $130;
  $131 = ((($127)) + 4|0);
  $132 = ((($1)) + 8|0);
  $133 = HEAP32[$132>>2]|0;
  $134 = (1 + ($133))|0;
  HEAP32[$131>>2] = $134;
  $135 = ((($131)) + 4|0);
  $136 = HEAP32[$1>>2]|0;
  $137 = (1 + ($136))|0;
  HEAP32[$135>>2] = $137;
  $138 = ((($135)) + 4|0);
  $139 = ((($1)) + 4|0);
  $140 = HEAP32[$139>>2]|0;
  $141 = (0 + ($140))|0;
  HEAP32[$138>>2] = $141;
  $142 = ((($138)) + 4|0);
  $143 = ((($1)) + 8|0);
  $144 = HEAP32[$143>>2]|0;
  $145 = (0 + ($144))|0;
  HEAP32[$142>>2] = $145;
  $146 = ((($142)) + 4|0);
  $147 = HEAP32[$1>>2]|0;
  $148 = (1 + ($147))|0;
  HEAP32[$146>>2] = $148;
  $149 = ((($146)) + 4|0);
  $150 = ((($1)) + 4|0);
  $151 = HEAP32[$150>>2]|0;
  $152 = (1 + ($151))|0;
  HEAP32[$149>>2] = $152;
  $153 = ((($149)) + 4|0);
  $154 = ((($1)) + 8|0);
  $155 = HEAP32[$154>>2]|0;
  $156 = (0 + ($155))|0;
  HEAP32[$153>>2] = $156;
  $157 = ((($153)) + 4|0);
  $158 = HEAP32[$1>>2]|0;
  $159 = (1 + ($158))|0;
  HEAP32[$157>>2] = $159;
  $160 = ((($157)) + 4|0);
  $161 = ((($1)) + 4|0);
  $162 = HEAP32[$161>>2]|0;
  $163 = (1 + ($162))|0;
  HEAP32[$160>>2] = $163;
  $164 = ((($160)) + 4|0);
  $165 = ((($1)) + 8|0);
  $166 = HEAP32[$165>>2]|0;
  $167 = (1 + ($166))|0;
  HEAP32[$164>>2] = $167;
  HEAP32[$112>>2] = $113;
  $168 = ((($112)) + 4|0);
  HEAP32[$168>>2] = 12;
  ;HEAP8[$110>>0]=HEAP8[$112>>0]|0;HEAP8[$110+1>>0]=HEAP8[$112+1>>0]|0;HEAP8[$110+2>>0]=HEAP8[$112+2>>0]|0;HEAP8[$110+3>>0]=HEAP8[$112+3>>0]|0;HEAP8[$110+4>>0]=HEAP8[$112+4>>0]|0;HEAP8[$110+5>>0]=HEAP8[$112+5>>0]|0;HEAP8[$110+6>>0]=HEAP8[$112+6>>0]|0;HEAP8[$110+7>>0]=HEAP8[$112+7>>0]|0;
  $107 = $0;
  $169 = $107;
  $106 = $169;
  $170 = $106;
  $105 = $170;
  HEAP32[$170>>2] = 0;
  $171 = ((($170)) + 4|0);
  HEAP32[$171>>2] = 0;
  $172 = ((($170)) + 8|0);
  $103 = $172;
  HEAP32[$104>>2] = 0;
  $173 = $103;
  $102 = $104;
  $174 = $102;
  $175 = HEAP32[$174>>2]|0;
  $100 = $173;
  HEAP32[$101>>2] = $175;
  $176 = $100;
  $99 = $176;
  $98 = $101;
  $177 = $98;
  $178 = HEAP32[$177>>2]|0;
  HEAP32[$176>>2] = $178;
  $97 = $110;
  $179 = $97;
  $180 = ((($179)) + 4|0);
  $181 = HEAP32[$180>>2]|0;
  $182 = ($181>>>0)>(0);
  if (!($182)) {
   STACKTOP = sp;return;
  }
  $96 = $110;
  $183 = $96;
  $184 = ((($183)) + 4|0);
  $185 = HEAP32[$184>>2]|0;
  __THREW__ = 0;
  invoke_vii(34,($169|0),($185|0));
  $186 = __THREW__; __THREW__ = 0;
  $187 = $186&1;
  if ($187) {
   $200 = ___cxa_find_matching_catch_2()|0;
   $201 = tempRet0;
   $108 = $200;
   $109 = $201;
   __ZNSt3__213__vector_baseIiNS_9allocatorIiEEED2Ev($169);
   $202 = $108;
   $203 = $109;
   ___resumeException($202|0);
   // unreachable;
  }
  $93 = $110;
  $188 = $93;
  $189 = HEAP32[$188>>2]|0;
  $94 = $110;
  $190 = $94;
  $191 = HEAP32[$190>>2]|0;
  $192 = ((($190)) + 4|0);
  $193 = HEAP32[$192>>2]|0;
  $194 = (($191) + ($193<<2)|0);
  $95 = $110;
  $195 = $95;
  $196 = ((($195)) + 4|0);
  $197 = HEAP32[$196>>2]|0;
  __THREW__ = 0;
  invoke_viiii(35,($169|0),($189|0),($194|0),($197|0));
  $198 = __THREW__; __THREW__ = 0;
  $199 = $198&1;
  if ($199) {
   $200 = ___cxa_find_matching_catch_2()|0;
   $201 = tempRet0;
   $108 = $200;
   $109 = $201;
   __ZNSt3__213__vector_baseIiNS_9allocatorIiEEED2Ev($169);
   $202 = $108;
   $203 = $109;
   ___resumeException($202|0);
   // unreachable;
  } else {
   STACKTOP = sp;return;
  }
  break;
 }
 case 1:  {
  $204 = HEAP32[$1>>2]|0;
  $205 = (0 + ($204))|0;
  HEAP32[$115>>2] = $205;
  $206 = ((($115)) + 4|0);
  $207 = ((($1)) + 4|0);
  $208 = HEAP32[$207>>2]|0;
  $209 = (0 + ($208))|0;
  HEAP32[$206>>2] = $209;
  $210 = ((($206)) + 4|0);
  $211 = ((($1)) + 8|0);
  $212 = HEAP32[$211>>2]|0;
  $213 = (0 + ($212))|0;
  HEAP32[$210>>2] = $213;
  $214 = ((($210)) + 4|0);
  $215 = HEAP32[$1>>2]|0;
  $216 = (0 + ($215))|0;
  HEAP32[$214>>2] = $216;
  $217 = ((($214)) + 4|0);
  $218 = ((($1)) + 4|0);
  $219 = HEAP32[$218>>2]|0;
  $220 = (0 + ($219))|0;
  HEAP32[$217>>2] = $220;
  $221 = ((($217)) + 4|0);
  $222 = ((($1)) + 8|0);
  $223 = HEAP32[$222>>2]|0;
  $224 = (1 + ($223))|0;
  HEAP32[$221>>2] = $224;
  $225 = ((($221)) + 4|0);
  $226 = HEAP32[$1>>2]|0;
  $227 = (0 + ($226))|0;
  HEAP32[$225>>2] = $227;
  $228 = ((($225)) + 4|0);
  $229 = ((($1)) + 4|0);
  $230 = HEAP32[$229>>2]|0;
  $231 = (1 + ($230))|0;
  HEAP32[$228>>2] = $231;
  $232 = ((($228)) + 4|0);
  $233 = ((($1)) + 8|0);
  $234 = HEAP32[$233>>2]|0;
  $235 = (1 + ($234))|0;
  HEAP32[$232>>2] = $235;
  $236 = ((($232)) + 4|0);
  $237 = HEAP32[$1>>2]|0;
  $238 = (0 + ($237))|0;
  HEAP32[$236>>2] = $238;
  $239 = ((($236)) + 4|0);
  $240 = ((($1)) + 4|0);
  $241 = HEAP32[$240>>2]|0;
  $242 = (1 + ($241))|0;
  HEAP32[$239>>2] = $242;
  $243 = ((($239)) + 4|0);
  $244 = ((($1)) + 8|0);
  $245 = HEAP32[$244>>2]|0;
  $246 = (0 + ($245))|0;
  HEAP32[$243>>2] = $246;
  HEAP32[$114>>2] = $115;
  $247 = ((($114)) + 4|0);
  HEAP32[$247>>2] = 12;
  ;HEAP8[$92>>0]=HEAP8[$114>>0]|0;HEAP8[$92+1>>0]=HEAP8[$114+1>>0]|0;HEAP8[$92+2>>0]=HEAP8[$114+2>>0]|0;HEAP8[$92+3>>0]=HEAP8[$114+3>>0]|0;HEAP8[$92+4>>0]=HEAP8[$114+4>>0]|0;HEAP8[$92+5>>0]=HEAP8[$114+5>>0]|0;HEAP8[$92+6>>0]=HEAP8[$114+6>>0]|0;HEAP8[$92+7>>0]=HEAP8[$114+7>>0]|0;
  $89 = $0;
  $248 = $89;
  $88 = $248;
  $249 = $88;
  $87 = $249;
  HEAP32[$249>>2] = 0;
  $250 = ((($249)) + 4|0);
  HEAP32[$250>>2] = 0;
  $251 = ((($249)) + 8|0);
  $85 = $251;
  HEAP32[$86>>2] = 0;
  $252 = $85;
  $84 = $86;
  $253 = $84;
  $254 = HEAP32[$253>>2]|0;
  $82 = $252;
  HEAP32[$83>>2] = $254;
  $255 = $82;
  $81 = $255;
  $80 = $83;
  $256 = $80;
  $257 = HEAP32[$256>>2]|0;
  HEAP32[$255>>2] = $257;
  $79 = $92;
  $258 = $79;
  $259 = ((($258)) + 4|0);
  $260 = HEAP32[$259>>2]|0;
  $261 = ($260>>>0)>(0);
  if (!($261)) {
   STACKTOP = sp;return;
  }
  $78 = $92;
  $262 = $78;
  $263 = ((($262)) + 4|0);
  $264 = HEAP32[$263>>2]|0;
  __THREW__ = 0;
  invoke_vii(34,($248|0),($264|0));
  $265 = __THREW__; __THREW__ = 0;
  $266 = $265&1;
  if ($266) {
   $279 = ___cxa_find_matching_catch_2()|0;
   $280 = tempRet0;
   $90 = $279;
   $91 = $280;
   __ZNSt3__213__vector_baseIiNS_9allocatorIiEEED2Ev($248);
   $281 = $90;
   $282 = $91;
   ___resumeException($281|0);
   // unreachable;
  }
  $75 = $92;
  $267 = $75;
  $268 = HEAP32[$267>>2]|0;
  $76 = $92;
  $269 = $76;
  $270 = HEAP32[$269>>2]|0;
  $271 = ((($269)) + 4|0);
  $272 = HEAP32[$271>>2]|0;
  $273 = (($270) + ($272<<2)|0);
  $77 = $92;
  $274 = $77;
  $275 = ((($274)) + 4|0);
  $276 = HEAP32[$275>>2]|0;
  __THREW__ = 0;
  invoke_viiii(35,($248|0),($268|0),($273|0),($276|0));
  $277 = __THREW__; __THREW__ = 0;
  $278 = $277&1;
  if ($278) {
   $279 = ___cxa_find_matching_catch_2()|0;
   $280 = tempRet0;
   $90 = $279;
   $91 = $280;
   __ZNSt3__213__vector_baseIiNS_9allocatorIiEEED2Ev($248);
   $281 = $90;
   $282 = $91;
   ___resumeException($281|0);
   // unreachable;
  } else {
   STACKTOP = sp;return;
  }
  break;
 }
 case 2:  {
  $283 = HEAP32[$1>>2]|0;
  $284 = (0 + ($283))|0;
  HEAP32[$117>>2] = $284;
  $285 = ((($117)) + 4|0);
  $286 = ((($1)) + 4|0);
  $287 = HEAP32[$286>>2]|0;
  $288 = (1 + ($287))|0;
  HEAP32[$285>>2] = $288;
  $289 = ((($285)) + 4|0);
  $290 = ((($1)) + 8|0);
  $291 = HEAP32[$290>>2]|0;
  $292 = (1 + ($291))|0;
  HEAP32[$289>>2] = $292;
  $293 = ((($289)) + 4|0);
  $294 = HEAP32[$1>>2]|0;
  $295 = (1 + ($294))|0;
  HEAP32[$293>>2] = $295;
  $296 = ((($293)) + 4|0);
  $297 = ((($1)) + 4|0);
  $298 = HEAP32[$297>>2]|0;
  $299 = (1 + ($298))|0;
  HEAP32[$296>>2] = $299;
  $300 = ((($296)) + 4|0);
  $301 = ((($1)) + 8|0);
  $302 = HEAP32[$301>>2]|0;
  $303 = (1 + ($302))|0;
  HEAP32[$300>>2] = $303;
  $304 = ((($300)) + 4|0);
  $305 = HEAP32[$1>>2]|0;
  $306 = (1 + ($305))|0;
  HEAP32[$304>>2] = $306;
  $307 = ((($304)) + 4|0);
  $308 = ((($1)) + 4|0);
  $309 = HEAP32[$308>>2]|0;
  $310 = (1 + ($309))|0;
  HEAP32[$307>>2] = $310;
  $311 = ((($307)) + 4|0);
  $312 = ((($1)) + 8|0);
  $313 = HEAP32[$312>>2]|0;
  $314 = (0 + ($313))|0;
  HEAP32[$311>>2] = $314;
  $315 = ((($311)) + 4|0);
  $316 = HEAP32[$1>>2]|0;
  $317 = (0 + ($316))|0;
  HEAP32[$315>>2] = $317;
  $318 = ((($315)) + 4|0);
  $319 = ((($1)) + 4|0);
  $320 = HEAP32[$319>>2]|0;
  $321 = (1 + ($320))|0;
  HEAP32[$318>>2] = $321;
  $322 = ((($318)) + 4|0);
  $323 = ((($1)) + 8|0);
  $324 = HEAP32[$323>>2]|0;
  $325 = (0 + ($324))|0;
  HEAP32[$322>>2] = $325;
  HEAP32[$116>>2] = $117;
  $326 = ((($116)) + 4|0);
  HEAP32[$326>>2] = 12;
  ;HEAP8[$74>>0]=HEAP8[$116>>0]|0;HEAP8[$74+1>>0]=HEAP8[$116+1>>0]|0;HEAP8[$74+2>>0]=HEAP8[$116+2>>0]|0;HEAP8[$74+3>>0]=HEAP8[$116+3>>0]|0;HEAP8[$74+4>>0]=HEAP8[$116+4>>0]|0;HEAP8[$74+5>>0]=HEAP8[$116+5>>0]|0;HEAP8[$74+6>>0]=HEAP8[$116+6>>0]|0;HEAP8[$74+7>>0]=HEAP8[$116+7>>0]|0;
  $71 = $0;
  $327 = $71;
  $70 = $327;
  $328 = $70;
  $69 = $328;
  HEAP32[$328>>2] = 0;
  $329 = ((($328)) + 4|0);
  HEAP32[$329>>2] = 0;
  $330 = ((($328)) + 8|0);
  $67 = $330;
  HEAP32[$68>>2] = 0;
  $331 = $67;
  $66 = $68;
  $332 = $66;
  $333 = HEAP32[$332>>2]|0;
  $64 = $331;
  HEAP32[$65>>2] = $333;
  $334 = $64;
  $63 = $334;
  $62 = $65;
  $335 = $62;
  $336 = HEAP32[$335>>2]|0;
  HEAP32[$334>>2] = $336;
  $61 = $74;
  $337 = $61;
  $338 = ((($337)) + 4|0);
  $339 = HEAP32[$338>>2]|0;
  $340 = ($339>>>0)>(0);
  if (!($340)) {
   STACKTOP = sp;return;
  }
  $60 = $74;
  $341 = $60;
  $342 = ((($341)) + 4|0);
  $343 = HEAP32[$342>>2]|0;
  __THREW__ = 0;
  invoke_vii(34,($327|0),($343|0));
  $344 = __THREW__; __THREW__ = 0;
  $345 = $344&1;
  if ($345) {
   $358 = ___cxa_find_matching_catch_2()|0;
   $359 = tempRet0;
   $72 = $358;
   $73 = $359;
   __ZNSt3__213__vector_baseIiNS_9allocatorIiEEED2Ev($327);
   $360 = $72;
   $361 = $73;
   ___resumeException($360|0);
   // unreachable;
  }
  $57 = $74;
  $346 = $57;
  $347 = HEAP32[$346>>2]|0;
  $58 = $74;
  $348 = $58;
  $349 = HEAP32[$348>>2]|0;
  $350 = ((($348)) + 4|0);
  $351 = HEAP32[$350>>2]|0;
  $352 = (($349) + ($351<<2)|0);
  $59 = $74;
  $353 = $59;
  $354 = ((($353)) + 4|0);
  $355 = HEAP32[$354>>2]|0;
  __THREW__ = 0;
  invoke_viiii(35,($327|0),($347|0),($352|0),($355|0));
  $356 = __THREW__; __THREW__ = 0;
  $357 = $356&1;
  if ($357) {
   $358 = ___cxa_find_matching_catch_2()|0;
   $359 = tempRet0;
   $72 = $358;
   $73 = $359;
   __ZNSt3__213__vector_baseIiNS_9allocatorIiEEED2Ev($327);
   $360 = $72;
   $361 = $73;
   ___resumeException($360|0);
   // unreachable;
  } else {
   STACKTOP = sp;return;
  }
  break;
 }
 case 3:  {
  $362 = HEAP32[$1>>2]|0;
  $363 = (0 + ($362))|0;
  HEAP32[$119>>2] = $363;
  $364 = ((($119)) + 4|0);
  $365 = ((($1)) + 4|0);
  $366 = HEAP32[$365>>2]|0;
  $367 = (0 + ($366))|0;
  HEAP32[$364>>2] = $367;
  $368 = ((($364)) + 4|0);
  $369 = ((($1)) + 8|0);
  $370 = HEAP32[$369>>2]|0;
  $371 = (0 + ($370))|0;
  HEAP32[$368>>2] = $371;
  $372 = ((($368)) + 4|0);
  $373 = HEAP32[$1>>2]|0;
  $374 = (1 + ($373))|0;
  HEAP32[$372>>2] = $374;
  $375 = ((($372)) + 4|0);
  $376 = ((($1)) + 4|0);
  $377 = HEAP32[$376>>2]|0;
  $378 = (0 + ($377))|0;
  HEAP32[$375>>2] = $378;
  $379 = ((($375)) + 4|0);
  $380 = ((($1)) + 8|0);
  $381 = HEAP32[$380>>2]|0;
  $382 = (0 + ($381))|0;
  HEAP32[$379>>2] = $382;
  $383 = ((($379)) + 4|0);
  $384 = HEAP32[$1>>2]|0;
  $385 = (1 + ($384))|0;
  HEAP32[$383>>2] = $385;
  $386 = ((($383)) + 4|0);
  $387 = ((($1)) + 4|0);
  $388 = HEAP32[$387>>2]|0;
  $389 = (0 + ($388))|0;
  HEAP32[$386>>2] = $389;
  $390 = ((($386)) + 4|0);
  $391 = ((($1)) + 8|0);
  $392 = HEAP32[$391>>2]|0;
  $393 = (1 + ($392))|0;
  HEAP32[$390>>2] = $393;
  $394 = ((($390)) + 4|0);
  $395 = HEAP32[$1>>2]|0;
  $396 = (0 + ($395))|0;
  HEAP32[$394>>2] = $396;
  $397 = ((($394)) + 4|0);
  $398 = ((($1)) + 4|0);
  $399 = HEAP32[$398>>2]|0;
  $400 = (0 + ($399))|0;
  HEAP32[$397>>2] = $400;
  $401 = ((($397)) + 4|0);
  $402 = ((($1)) + 8|0);
  $403 = HEAP32[$402>>2]|0;
  $404 = (1 + ($403))|0;
  HEAP32[$401>>2] = $404;
  HEAP32[$118>>2] = $119;
  $405 = ((($118)) + 4|0);
  HEAP32[$405>>2] = 12;
  ;HEAP8[$56>>0]=HEAP8[$118>>0]|0;HEAP8[$56+1>>0]=HEAP8[$118+1>>0]|0;HEAP8[$56+2>>0]=HEAP8[$118+2>>0]|0;HEAP8[$56+3>>0]=HEAP8[$118+3>>0]|0;HEAP8[$56+4>>0]=HEAP8[$118+4>>0]|0;HEAP8[$56+5>>0]=HEAP8[$118+5>>0]|0;HEAP8[$56+6>>0]=HEAP8[$118+6>>0]|0;HEAP8[$56+7>>0]=HEAP8[$118+7>>0]|0;
  $53 = $0;
  $406 = $53;
  $52 = $406;
  $407 = $52;
  $51 = $407;
  HEAP32[$407>>2] = 0;
  $408 = ((($407)) + 4|0);
  HEAP32[$408>>2] = 0;
  $409 = ((($407)) + 8|0);
  $49 = $409;
  HEAP32[$50>>2] = 0;
  $410 = $49;
  $48 = $50;
  $411 = $48;
  $412 = HEAP32[$411>>2]|0;
  $46 = $410;
  HEAP32[$47>>2] = $412;
  $413 = $46;
  $45 = $413;
  $44 = $47;
  $414 = $44;
  $415 = HEAP32[$414>>2]|0;
  HEAP32[$413>>2] = $415;
  $43 = $56;
  $416 = $43;
  $417 = ((($416)) + 4|0);
  $418 = HEAP32[$417>>2]|0;
  $419 = ($418>>>0)>(0);
  if (!($419)) {
   STACKTOP = sp;return;
  }
  $42 = $56;
  $420 = $42;
  $421 = ((($420)) + 4|0);
  $422 = HEAP32[$421>>2]|0;
  __THREW__ = 0;
  invoke_vii(34,($406|0),($422|0));
  $423 = __THREW__; __THREW__ = 0;
  $424 = $423&1;
  if ($424) {
   $437 = ___cxa_find_matching_catch_2()|0;
   $438 = tempRet0;
   $54 = $437;
   $55 = $438;
   __ZNSt3__213__vector_baseIiNS_9allocatorIiEEED2Ev($406);
   $439 = $54;
   $440 = $55;
   ___resumeException($439|0);
   // unreachable;
  }
  $39 = $56;
  $425 = $39;
  $426 = HEAP32[$425>>2]|0;
  $40 = $56;
  $427 = $40;
  $428 = HEAP32[$427>>2]|0;
  $429 = ((($427)) + 4|0);
  $430 = HEAP32[$429>>2]|0;
  $431 = (($428) + ($430<<2)|0);
  $41 = $56;
  $432 = $41;
  $433 = ((($432)) + 4|0);
  $434 = HEAP32[$433>>2]|0;
  __THREW__ = 0;
  invoke_viiii(35,($406|0),($426|0),($431|0),($434|0));
  $435 = __THREW__; __THREW__ = 0;
  $436 = $435&1;
  if ($436) {
   $437 = ___cxa_find_matching_catch_2()|0;
   $438 = tempRet0;
   $54 = $437;
   $55 = $438;
   __ZNSt3__213__vector_baseIiNS_9allocatorIiEEED2Ev($406);
   $439 = $54;
   $440 = $55;
   ___resumeException($439|0);
   // unreachable;
  } else {
   STACKTOP = sp;return;
  }
  break;
 }
 case 4:  {
  $441 = HEAP32[$1>>2]|0;
  $442 = (0 + ($441))|0;
  HEAP32[$121>>2] = $442;
  $443 = ((($121)) + 4|0);
  $444 = ((($1)) + 4|0);
  $445 = HEAP32[$444>>2]|0;
  $446 = (0 + ($445))|0;
  HEAP32[$443>>2] = $446;
  $447 = ((($443)) + 4|0);
  $448 = ((($1)) + 8|0);
  $449 = HEAP32[$448>>2]|0;
  $450 = (1 + ($449))|0;
  HEAP32[$447>>2] = $450;
  $451 = ((($447)) + 4|0);
  $452 = HEAP32[$1>>2]|0;
  $453 = (1 + ($452))|0;
  HEAP32[$451>>2] = $453;
  $454 = ((($451)) + 4|0);
  $455 = ((($1)) + 4|0);
  $456 = HEAP32[$455>>2]|0;
  $457 = (0 + ($456))|0;
  HEAP32[$454>>2] = $457;
  $458 = ((($454)) + 4|0);
  $459 = ((($1)) + 8|0);
  $460 = HEAP32[$459>>2]|0;
  $461 = (1 + ($460))|0;
  HEAP32[$458>>2] = $461;
  $462 = ((($458)) + 4|0);
  $463 = HEAP32[$1>>2]|0;
  $464 = (1 + ($463))|0;
  HEAP32[$462>>2] = $464;
  $465 = ((($462)) + 4|0);
  $466 = ((($1)) + 4|0);
  $467 = HEAP32[$466>>2]|0;
  $468 = (1 + ($467))|0;
  HEAP32[$465>>2] = $468;
  $469 = ((($465)) + 4|0);
  $470 = ((($1)) + 8|0);
  $471 = HEAP32[$470>>2]|0;
  $472 = (1 + ($471))|0;
  HEAP32[$469>>2] = $472;
  $473 = ((($469)) + 4|0);
  $474 = HEAP32[$1>>2]|0;
  $475 = (0 + ($474))|0;
  HEAP32[$473>>2] = $475;
  $476 = ((($473)) + 4|0);
  $477 = ((($1)) + 4|0);
  $478 = HEAP32[$477>>2]|0;
  $479 = (1 + ($478))|0;
  HEAP32[$476>>2] = $479;
  $480 = ((($476)) + 4|0);
  $481 = ((($1)) + 8|0);
  $482 = HEAP32[$481>>2]|0;
  $483 = (1 + ($482))|0;
  HEAP32[$480>>2] = $483;
  HEAP32[$120>>2] = $121;
  $484 = ((($120)) + 4|0);
  HEAP32[$484>>2] = 12;
  ;HEAP8[$38>>0]=HEAP8[$120>>0]|0;HEAP8[$38+1>>0]=HEAP8[$120+1>>0]|0;HEAP8[$38+2>>0]=HEAP8[$120+2>>0]|0;HEAP8[$38+3>>0]=HEAP8[$120+3>>0]|0;HEAP8[$38+4>>0]=HEAP8[$120+4>>0]|0;HEAP8[$38+5>>0]=HEAP8[$120+5>>0]|0;HEAP8[$38+6>>0]=HEAP8[$120+6>>0]|0;HEAP8[$38+7>>0]=HEAP8[$120+7>>0]|0;
  $35 = $0;
  $485 = $35;
  $34 = $485;
  $486 = $34;
  $33 = $486;
  HEAP32[$486>>2] = 0;
  $487 = ((($486)) + 4|0);
  HEAP32[$487>>2] = 0;
  $488 = ((($486)) + 8|0);
  $31 = $488;
  HEAP32[$32>>2] = 0;
  $489 = $31;
  $30 = $32;
  $490 = $30;
  $491 = HEAP32[$490>>2]|0;
  $28 = $489;
  HEAP32[$29>>2] = $491;
  $492 = $28;
  $27 = $492;
  $26 = $29;
  $493 = $26;
  $494 = HEAP32[$493>>2]|0;
  HEAP32[$492>>2] = $494;
  $25 = $38;
  $495 = $25;
  $496 = ((($495)) + 4|0);
  $497 = HEAP32[$496>>2]|0;
  $498 = ($497>>>0)>(0);
  if (!($498)) {
   STACKTOP = sp;return;
  }
  $24 = $38;
  $499 = $24;
  $500 = ((($499)) + 4|0);
  $501 = HEAP32[$500>>2]|0;
  __THREW__ = 0;
  invoke_vii(34,($485|0),($501|0));
  $502 = __THREW__; __THREW__ = 0;
  $503 = $502&1;
  if ($503) {
   $516 = ___cxa_find_matching_catch_2()|0;
   $517 = tempRet0;
   $36 = $516;
   $37 = $517;
   __ZNSt3__213__vector_baseIiNS_9allocatorIiEEED2Ev($485);
   $518 = $36;
   $519 = $37;
   ___resumeException($518|0);
   // unreachable;
  }
  $21 = $38;
  $504 = $21;
  $505 = HEAP32[$504>>2]|0;
  $22 = $38;
  $506 = $22;
  $507 = HEAP32[$506>>2]|0;
  $508 = ((($506)) + 4|0);
  $509 = HEAP32[$508>>2]|0;
  $510 = (($507) + ($509<<2)|0);
  $23 = $38;
  $511 = $23;
  $512 = ((($511)) + 4|0);
  $513 = HEAP32[$512>>2]|0;
  __THREW__ = 0;
  invoke_viiii(35,($485|0),($505|0),($510|0),($513|0));
  $514 = __THREW__; __THREW__ = 0;
  $515 = $514&1;
  if ($515) {
   $516 = ___cxa_find_matching_catch_2()|0;
   $517 = tempRet0;
   $36 = $516;
   $37 = $517;
   __ZNSt3__213__vector_baseIiNS_9allocatorIiEEED2Ev($485);
   $518 = $36;
   $519 = $37;
   ___resumeException($518|0);
   // unreachable;
  } else {
   STACKTOP = sp;return;
  }
  break;
 }
 default: {
  $520 = HEAP32[$1>>2]|0;
  $521 = (1 + ($520))|0;
  HEAP32[$123>>2] = $521;
  $522 = ((($123)) + 4|0);
  $523 = ((($1)) + 4|0);
  $524 = HEAP32[$523>>2]|0;
  $525 = (0 + ($524))|0;
  HEAP32[$522>>2] = $525;
  $526 = ((($522)) + 4|0);
  $527 = ((($1)) + 8|0);
  $528 = HEAP32[$527>>2]|0;
  $529 = (0 + ($528))|0;
  HEAP32[$526>>2] = $529;
  $530 = ((($526)) + 4|0);
  $531 = HEAP32[$1>>2]|0;
  $532 = (0 + ($531))|0;
  HEAP32[$530>>2] = $532;
  $533 = ((($530)) + 4|0);
  $534 = ((($1)) + 4|0);
  $535 = HEAP32[$534>>2]|0;
  $536 = (0 + ($535))|0;
  HEAP32[$533>>2] = $536;
  $537 = ((($533)) + 4|0);
  $538 = ((($1)) + 8|0);
  $539 = HEAP32[$538>>2]|0;
  $540 = (0 + ($539))|0;
  HEAP32[$537>>2] = $540;
  $541 = ((($537)) + 4|0);
  $542 = HEAP32[$1>>2]|0;
  $543 = (0 + ($542))|0;
  HEAP32[$541>>2] = $543;
  $544 = ((($541)) + 4|0);
  $545 = ((($1)) + 4|0);
  $546 = HEAP32[$545>>2]|0;
  $547 = (1 + ($546))|0;
  HEAP32[$544>>2] = $547;
  $548 = ((($544)) + 4|0);
  $549 = ((($1)) + 8|0);
  $550 = HEAP32[$549>>2]|0;
  $551 = (0 + ($550))|0;
  HEAP32[$548>>2] = $551;
  $552 = ((($548)) + 4|0);
  $553 = HEAP32[$1>>2]|0;
  $554 = (1 + ($553))|0;
  HEAP32[$552>>2] = $554;
  $555 = ((($552)) + 4|0);
  $556 = ((($1)) + 4|0);
  $557 = HEAP32[$556>>2]|0;
  $558 = (1 + ($557))|0;
  HEAP32[$555>>2] = $558;
  $559 = ((($555)) + 4|0);
  $560 = ((($1)) + 8|0);
  $561 = HEAP32[$560>>2]|0;
  $562 = (0 + ($561))|0;
  HEAP32[$559>>2] = $562;
  HEAP32[$122>>2] = $123;
  $563 = ((($122)) + 4|0);
  HEAP32[$563>>2] = 12;
  ;HEAP8[$20>>0]=HEAP8[$122>>0]|0;HEAP8[$20+1>>0]=HEAP8[$122+1>>0]|0;HEAP8[$20+2>>0]=HEAP8[$122+2>>0]|0;HEAP8[$20+3>>0]=HEAP8[$122+3>>0]|0;HEAP8[$20+4>>0]=HEAP8[$122+4>>0]|0;HEAP8[$20+5>>0]=HEAP8[$122+5>>0]|0;HEAP8[$20+6>>0]=HEAP8[$122+6>>0]|0;HEAP8[$20+7>>0]=HEAP8[$122+7>>0]|0;
  $17 = $0;
  $564 = $17;
  $16 = $564;
  $565 = $16;
  $15 = $565;
  HEAP32[$565>>2] = 0;
  $566 = ((($565)) + 4|0);
  HEAP32[$566>>2] = 0;
  $567 = ((($565)) + 8|0);
  $13 = $567;
  HEAP32[$14>>2] = 0;
  $568 = $13;
  $12 = $14;
  $569 = $12;
  $570 = HEAP32[$569>>2]|0;
  $10 = $568;
  HEAP32[$11>>2] = $570;
  $571 = $10;
  $9 = $571;
  $8 = $11;
  $572 = $8;
  $573 = HEAP32[$572>>2]|0;
  HEAP32[$571>>2] = $573;
  $7 = $20;
  $574 = $7;
  $575 = ((($574)) + 4|0);
  $576 = HEAP32[$575>>2]|0;
  $577 = ($576>>>0)>(0);
  if (!($577)) {
   STACKTOP = sp;return;
  }
  $6 = $20;
  $578 = $6;
  $579 = ((($578)) + 4|0);
  $580 = HEAP32[$579>>2]|0;
  __THREW__ = 0;
  invoke_vii(34,($564|0),($580|0));
  $581 = __THREW__; __THREW__ = 0;
  $582 = $581&1;
  if ($582) {
   $595 = ___cxa_find_matching_catch_2()|0;
   $596 = tempRet0;
   $18 = $595;
   $19 = $596;
   __ZNSt3__213__vector_baseIiNS_9allocatorIiEEED2Ev($564);
   $597 = $18;
   $598 = $19;
   ___resumeException($597|0);
   // unreachable;
  }
  $3 = $20;
  $583 = $3;
  $584 = HEAP32[$583>>2]|0;
  $4 = $20;
  $585 = $4;
  $586 = HEAP32[$585>>2]|0;
  $587 = ((($585)) + 4|0);
  $588 = HEAP32[$587>>2]|0;
  $589 = (($586) + ($588<<2)|0);
  $5 = $20;
  $590 = $5;
  $591 = ((($590)) + 4|0);
  $592 = HEAP32[$591>>2]|0;
  __THREW__ = 0;
  invoke_viiii(35,($564|0),($584|0),($589|0),($592|0));
  $593 = __THREW__; __THREW__ = 0;
  $594 = $593&1;
  if ($594) {
   $595 = ___cxa_find_matching_catch_2()|0;
   $596 = tempRet0;
   $18 = $595;
   $19 = $596;
   __ZNSt3__213__vector_baseIiNS_9allocatorIiEEED2Ev($564);
   $597 = $18;
   $598 = $19;
   ___resumeException($597|0);
   // unreachable;
  } else {
   STACKTOP = sp;return;
  }
 }
 }
}
function ___cxx_global_var_init() {
 var $$sink1 = 0, $$sink2 = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0;
 var $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0;
 var $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0;
 var $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0;
 var $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0;
 var $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0;
 var $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0;
 var $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0;
 var $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0;
 var $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0;
 var $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0;
 var $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0;
 var $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0;
 var $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0;
 var $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0;
 var $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0;
 var $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0, $401 = 0;
 var $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0;
 var $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0;
 var $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0;
 var $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 688|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(688|0);
 $8 = sp + 640|0;
 $11 = sp + 628|0;
 $17 = sp + 48|0;
 $26 = sp + 572|0;
 $29 = sp + 560|0;
 $35 = sp + 40|0;
 $44 = sp + 504|0;
 $47 = sp + 492|0;
 $53 = sp + 32|0;
 $62 = sp + 436|0;
 $65 = sp + 424|0;
 $71 = sp + 24|0;
 $80 = sp + 368|0;
 $83 = sp + 356|0;
 $89 = sp + 16|0;
 $98 = sp + 300|0;
 $101 = sp + 288|0;
 $107 = sp + 8|0;
 $116 = sp + 232|0;
 $119 = sp + 220|0;
 $125 = sp;
 $126 = sp + 192|0;
 $127 = sp + 120|0;
 $129 = sp + 104|0;
 $132 = sp + 88|0;
 $133 = sp + 80|0;
 $134 = sp + 72|0;
 $135 = sp + 64|0;
 $136 = sp + 56|0;
 $128 = $127;
 HEAP32[$129>>2] = 600;
 $137 = ((($129)) + 4|0);
 HEAP32[$137>>2] = 3;
 ;HEAP8[$125>>0]=HEAP8[$129>>0]|0;HEAP8[$125+1>>0]=HEAP8[$129+1>>0]|0;HEAP8[$125+2>>0]=HEAP8[$129+2>>0]|0;HEAP8[$125+3>>0]=HEAP8[$129+3>>0]|0;HEAP8[$125+4>>0]=HEAP8[$129+4>>0]|0;HEAP8[$125+5>>0]=HEAP8[$129+5>>0]|0;HEAP8[$125+6>>0]=HEAP8[$129+6>>0]|0;HEAP8[$125+7>>0]=HEAP8[$129+7>>0]|0;
 $122 = $127;
 $138 = $122;
 $121 = $138;
 $139 = $121;
 $120 = $139;
 HEAP32[$139>>2] = 0;
 $140 = ((($139)) + 4|0);
 HEAP32[$140>>2] = 0;
 $141 = ((($139)) + 8|0);
 $118 = $141;
 HEAP32[$119>>2] = 0;
 $142 = $118;
 $117 = $119;
 $143 = $117;
 $144 = HEAP32[$143>>2]|0;
 $115 = $142;
 HEAP32[$116>>2] = $144;
 $145 = $115;
 $114 = $145;
 $113 = $116;
 $146 = $113;
 $147 = HEAP32[$146>>2]|0;
 HEAP32[$145>>2] = $147;
 $112 = $125;
 $148 = $112;
 $149 = ((($148)) + 4|0);
 $150 = HEAP32[$149>>2]|0;
 $151 = ($150>>>0)>(0);
 do {
  if ($151) {
   $111 = $125;
   $152 = $111;
   $153 = ((($152)) + 4|0);
   $154 = HEAP32[$153>>2]|0;
   __THREW__ = 0;
   invoke_vii(34,($138|0),($154|0));
   $155 = __THREW__; __THREW__ = 0;
   $156 = $155&1;
   if (!($156)) {
    $108 = $125;
    $157 = $108;
    $158 = HEAP32[$157>>2]|0;
    $109 = $125;
    $159 = $109;
    $160 = HEAP32[$159>>2]|0;
    $161 = ((($159)) + 4|0);
    $162 = HEAP32[$161>>2]|0;
    $163 = (($160) + ($162<<2)|0);
    $110 = $125;
    $164 = $110;
    $165 = ((($164)) + 4|0);
    $166 = HEAP32[$165>>2]|0;
    __THREW__ = 0;
    invoke_viiii(35,($138|0),($158|0),($163|0),($166|0));
    $167 = __THREW__; __THREW__ = 0;
    $168 = $167&1;
    if (!($168)) {
     label = 5;
     break;
    }
   }
   $169 = ___cxa_find_matching_catch_2()|0;
   $170 = tempRet0;
   $123 = $169;
   $124 = $170;
   __ZNSt3__213__vector_baseIiNS_9allocatorIiEEED2Ev($138);
   $171 = $123;
   $172 = $124;
   $$sink1 = $172;$$sink2 = $171;
  } else {
   label = 5;
  }
 } while(0);
 L6: do {
  if ((label|0) == 5) {
   $173 = ((($127)) + 12|0);
   $128 = $173;
   HEAP32[$132>>2] = 612;
   $174 = ((($132)) + 4|0);
   HEAP32[$174>>2] = 3;
   ;HEAP8[$107>>0]=HEAP8[$132>>0]|0;HEAP8[$107+1>>0]=HEAP8[$132+1>>0]|0;HEAP8[$107+2>>0]=HEAP8[$132+2>>0]|0;HEAP8[$107+3>>0]=HEAP8[$132+3>>0]|0;HEAP8[$107+4>>0]=HEAP8[$132+4>>0]|0;HEAP8[$107+5>>0]=HEAP8[$132+5>>0]|0;HEAP8[$107+6>>0]=HEAP8[$132+6>>0]|0;HEAP8[$107+7>>0]=HEAP8[$132+7>>0]|0;
   $104 = $173;
   $175 = $104;
   $103 = $175;
   $176 = $103;
   $102 = $176;
   HEAP32[$176>>2] = 0;
   $177 = ((($176)) + 4|0);
   HEAP32[$177>>2] = 0;
   $178 = ((($176)) + 8|0);
   $100 = $178;
   HEAP32[$101>>2] = 0;
   $179 = $100;
   $99 = $101;
   $180 = $99;
   $181 = HEAP32[$180>>2]|0;
   $97 = $179;
   HEAP32[$98>>2] = $181;
   $182 = $97;
   $96 = $182;
   $95 = $98;
   $183 = $95;
   $184 = HEAP32[$183>>2]|0;
   HEAP32[$182>>2] = $184;
   $94 = $107;
   $185 = $94;
   $186 = ((($185)) + 4|0);
   $187 = HEAP32[$186>>2]|0;
   $188 = ($187>>>0)>(0);
   do {
    if ($188) {
     $93 = $107;
     $189 = $93;
     $190 = ((($189)) + 4|0);
     $191 = HEAP32[$190>>2]|0;
     __THREW__ = 0;
     invoke_vii(34,($175|0),($191|0));
     $192 = __THREW__; __THREW__ = 0;
     $193 = $192&1;
     if (!($193)) {
      $90 = $107;
      $194 = $90;
      $195 = HEAP32[$194>>2]|0;
      $91 = $107;
      $196 = $91;
      $197 = HEAP32[$196>>2]|0;
      $198 = ((($196)) + 4|0);
      $199 = HEAP32[$198>>2]|0;
      $200 = (($197) + ($199<<2)|0);
      $92 = $107;
      $201 = $92;
      $202 = ((($201)) + 4|0);
      $203 = HEAP32[$202>>2]|0;
      __THREW__ = 0;
      invoke_viiii(35,($175|0),($195|0),($200|0),($203|0));
      $204 = __THREW__; __THREW__ = 0;
      $205 = $204&1;
      if (!($205)) {
       break;
      }
     }
     $206 = ___cxa_find_matching_catch_2()|0;
     $207 = tempRet0;
     $105 = $206;
     $106 = $207;
     __ZNSt3__213__vector_baseIiNS_9allocatorIiEEED2Ev($175);
     $208 = $105;
     $209 = $106;
     $$sink1 = $209;$$sink2 = $208;
     break L6;
    }
   } while(0);
   $210 = ((($173)) + 12|0);
   $128 = $210;
   HEAP32[$133>>2] = 624;
   $211 = ((($133)) + 4|0);
   HEAP32[$211>>2] = 3;
   ;HEAP8[$89>>0]=HEAP8[$133>>0]|0;HEAP8[$89+1>>0]=HEAP8[$133+1>>0]|0;HEAP8[$89+2>>0]=HEAP8[$133+2>>0]|0;HEAP8[$89+3>>0]=HEAP8[$133+3>>0]|0;HEAP8[$89+4>>0]=HEAP8[$133+4>>0]|0;HEAP8[$89+5>>0]=HEAP8[$133+5>>0]|0;HEAP8[$89+6>>0]=HEAP8[$133+6>>0]|0;HEAP8[$89+7>>0]=HEAP8[$133+7>>0]|0;
   $86 = $210;
   $212 = $86;
   $85 = $212;
   $213 = $85;
   $84 = $213;
   HEAP32[$213>>2] = 0;
   $214 = ((($213)) + 4|0);
   HEAP32[$214>>2] = 0;
   $215 = ((($213)) + 8|0);
   $82 = $215;
   HEAP32[$83>>2] = 0;
   $216 = $82;
   $81 = $83;
   $217 = $81;
   $218 = HEAP32[$217>>2]|0;
   $79 = $216;
   HEAP32[$80>>2] = $218;
   $219 = $79;
   $78 = $219;
   $77 = $80;
   $220 = $77;
   $221 = HEAP32[$220>>2]|0;
   HEAP32[$219>>2] = $221;
   $76 = $89;
   $222 = $76;
   $223 = ((($222)) + 4|0);
   $224 = HEAP32[$223>>2]|0;
   $225 = ($224>>>0)>(0);
   do {
    if ($225) {
     $75 = $89;
     $226 = $75;
     $227 = ((($226)) + 4|0);
     $228 = HEAP32[$227>>2]|0;
     __THREW__ = 0;
     invoke_vii(34,($212|0),($228|0));
     $229 = __THREW__; __THREW__ = 0;
     $230 = $229&1;
     if (!($230)) {
      $72 = $89;
      $231 = $72;
      $232 = HEAP32[$231>>2]|0;
      $73 = $89;
      $233 = $73;
      $234 = HEAP32[$233>>2]|0;
      $235 = ((($233)) + 4|0);
      $236 = HEAP32[$235>>2]|0;
      $237 = (($234) + ($236<<2)|0);
      $74 = $89;
      $238 = $74;
      $239 = ((($238)) + 4|0);
      $240 = HEAP32[$239>>2]|0;
      __THREW__ = 0;
      invoke_viiii(35,($212|0),($232|0),($237|0),($240|0));
      $241 = __THREW__; __THREW__ = 0;
      $242 = $241&1;
      if (!($242)) {
       break;
      }
     }
     $243 = ___cxa_find_matching_catch_2()|0;
     $244 = tempRet0;
     $87 = $243;
     $88 = $244;
     __ZNSt3__213__vector_baseIiNS_9allocatorIiEEED2Ev($212);
     $245 = $87;
     $246 = $88;
     $$sink1 = $246;$$sink2 = $245;
     break L6;
    }
   } while(0);
   $247 = ((($210)) + 12|0);
   $128 = $247;
   HEAP32[$134>>2] = 636;
   $248 = ((($134)) + 4|0);
   HEAP32[$248>>2] = 3;
   ;HEAP8[$71>>0]=HEAP8[$134>>0]|0;HEAP8[$71+1>>0]=HEAP8[$134+1>>0]|0;HEAP8[$71+2>>0]=HEAP8[$134+2>>0]|0;HEAP8[$71+3>>0]=HEAP8[$134+3>>0]|0;HEAP8[$71+4>>0]=HEAP8[$134+4>>0]|0;HEAP8[$71+5>>0]=HEAP8[$134+5>>0]|0;HEAP8[$71+6>>0]=HEAP8[$134+6>>0]|0;HEAP8[$71+7>>0]=HEAP8[$134+7>>0]|0;
   $68 = $247;
   $249 = $68;
   $67 = $249;
   $250 = $67;
   $66 = $250;
   HEAP32[$250>>2] = 0;
   $251 = ((($250)) + 4|0);
   HEAP32[$251>>2] = 0;
   $252 = ((($250)) + 8|0);
   $64 = $252;
   HEAP32[$65>>2] = 0;
   $253 = $64;
   $63 = $65;
   $254 = $63;
   $255 = HEAP32[$254>>2]|0;
   $61 = $253;
   HEAP32[$62>>2] = $255;
   $256 = $61;
   $60 = $256;
   $59 = $62;
   $257 = $59;
   $258 = HEAP32[$257>>2]|0;
   HEAP32[$256>>2] = $258;
   $58 = $71;
   $259 = $58;
   $260 = ((($259)) + 4|0);
   $261 = HEAP32[$260>>2]|0;
   $262 = ($261>>>0)>(0);
   do {
    if ($262) {
     $57 = $71;
     $263 = $57;
     $264 = ((($263)) + 4|0);
     $265 = HEAP32[$264>>2]|0;
     __THREW__ = 0;
     invoke_vii(34,($249|0),($265|0));
     $266 = __THREW__; __THREW__ = 0;
     $267 = $266&1;
     if (!($267)) {
      $54 = $71;
      $268 = $54;
      $269 = HEAP32[$268>>2]|0;
      $55 = $71;
      $270 = $55;
      $271 = HEAP32[$270>>2]|0;
      $272 = ((($270)) + 4|0);
      $273 = HEAP32[$272>>2]|0;
      $274 = (($271) + ($273<<2)|0);
      $56 = $71;
      $275 = $56;
      $276 = ((($275)) + 4|0);
      $277 = HEAP32[$276>>2]|0;
      __THREW__ = 0;
      invoke_viiii(35,($249|0),($269|0),($274|0),($277|0));
      $278 = __THREW__; __THREW__ = 0;
      $279 = $278&1;
      if (!($279)) {
       break;
      }
     }
     $280 = ___cxa_find_matching_catch_2()|0;
     $281 = tempRet0;
     $69 = $280;
     $70 = $281;
     __ZNSt3__213__vector_baseIiNS_9allocatorIiEEED2Ev($249);
     $282 = $69;
     $283 = $70;
     $$sink1 = $283;$$sink2 = $282;
     break L6;
    }
   } while(0);
   $284 = ((($247)) + 12|0);
   $128 = $284;
   HEAP32[$135>>2] = 648;
   $285 = ((($135)) + 4|0);
   HEAP32[$285>>2] = 3;
   ;HEAP8[$53>>0]=HEAP8[$135>>0]|0;HEAP8[$53+1>>0]=HEAP8[$135+1>>0]|0;HEAP8[$53+2>>0]=HEAP8[$135+2>>0]|0;HEAP8[$53+3>>0]=HEAP8[$135+3>>0]|0;HEAP8[$53+4>>0]=HEAP8[$135+4>>0]|0;HEAP8[$53+5>>0]=HEAP8[$135+5>>0]|0;HEAP8[$53+6>>0]=HEAP8[$135+6>>0]|0;HEAP8[$53+7>>0]=HEAP8[$135+7>>0]|0;
   $50 = $284;
   $286 = $50;
   $49 = $286;
   $287 = $49;
   $48 = $287;
   HEAP32[$287>>2] = 0;
   $288 = ((($287)) + 4|0);
   HEAP32[$288>>2] = 0;
   $289 = ((($287)) + 8|0);
   $46 = $289;
   HEAP32[$47>>2] = 0;
   $290 = $46;
   $45 = $47;
   $291 = $45;
   $292 = HEAP32[$291>>2]|0;
   $43 = $290;
   HEAP32[$44>>2] = $292;
   $293 = $43;
   $42 = $293;
   $41 = $44;
   $294 = $41;
   $295 = HEAP32[$294>>2]|0;
   HEAP32[$293>>2] = $295;
   $40 = $53;
   $296 = $40;
   $297 = ((($296)) + 4|0);
   $298 = HEAP32[$297>>2]|0;
   $299 = ($298>>>0)>(0);
   do {
    if ($299) {
     $39 = $53;
     $300 = $39;
     $301 = ((($300)) + 4|0);
     $302 = HEAP32[$301>>2]|0;
     __THREW__ = 0;
     invoke_vii(34,($286|0),($302|0));
     $303 = __THREW__; __THREW__ = 0;
     $304 = $303&1;
     if (!($304)) {
      $36 = $53;
      $305 = $36;
      $306 = HEAP32[$305>>2]|0;
      $37 = $53;
      $307 = $37;
      $308 = HEAP32[$307>>2]|0;
      $309 = ((($307)) + 4|0);
      $310 = HEAP32[$309>>2]|0;
      $311 = (($308) + ($310<<2)|0);
      $38 = $53;
      $312 = $38;
      $313 = ((($312)) + 4|0);
      $314 = HEAP32[$313>>2]|0;
      __THREW__ = 0;
      invoke_viiii(35,($286|0),($306|0),($311|0),($314|0));
      $315 = __THREW__; __THREW__ = 0;
      $316 = $315&1;
      if (!($316)) {
       break;
      }
     }
     $317 = ___cxa_find_matching_catch_2()|0;
     $318 = tempRet0;
     $51 = $317;
     $52 = $318;
     __ZNSt3__213__vector_baseIiNS_9allocatorIiEEED2Ev($286);
     $319 = $51;
     $320 = $52;
     $$sink1 = $320;$$sink2 = $319;
     break L6;
    }
   } while(0);
   $321 = ((($284)) + 12|0);
   $128 = $321;
   HEAP32[$136>>2] = 660;
   $322 = ((($136)) + 4|0);
   HEAP32[$322>>2] = 3;
   ;HEAP8[$35>>0]=HEAP8[$136>>0]|0;HEAP8[$35+1>>0]=HEAP8[$136+1>>0]|0;HEAP8[$35+2>>0]=HEAP8[$136+2>>0]|0;HEAP8[$35+3>>0]=HEAP8[$136+3>>0]|0;HEAP8[$35+4>>0]=HEAP8[$136+4>>0]|0;HEAP8[$35+5>>0]=HEAP8[$136+5>>0]|0;HEAP8[$35+6>>0]=HEAP8[$136+6>>0]|0;HEAP8[$35+7>>0]=HEAP8[$136+7>>0]|0;
   $32 = $321;
   $323 = $32;
   $31 = $323;
   $324 = $31;
   $30 = $324;
   HEAP32[$324>>2] = 0;
   $325 = ((($324)) + 4|0);
   HEAP32[$325>>2] = 0;
   $326 = ((($324)) + 8|0);
   $28 = $326;
   HEAP32[$29>>2] = 0;
   $327 = $28;
   $27 = $29;
   $328 = $27;
   $329 = HEAP32[$328>>2]|0;
   $25 = $327;
   HEAP32[$26>>2] = $329;
   $330 = $25;
   $24 = $330;
   $23 = $26;
   $331 = $23;
   $332 = HEAP32[$331>>2]|0;
   HEAP32[$330>>2] = $332;
   $22 = $35;
   $333 = $22;
   $334 = ((($333)) + 4|0);
   $335 = HEAP32[$334>>2]|0;
   $336 = ($335>>>0)>(0);
   do {
    if ($336) {
     $21 = $35;
     $337 = $21;
     $338 = ((($337)) + 4|0);
     $339 = HEAP32[$338>>2]|0;
     __THREW__ = 0;
     invoke_vii(34,($323|0),($339|0));
     $340 = __THREW__; __THREW__ = 0;
     $341 = $340&1;
     if (!($341)) {
      $18 = $35;
      $342 = $18;
      $343 = HEAP32[$342>>2]|0;
      $19 = $35;
      $344 = $19;
      $345 = HEAP32[$344>>2]|0;
      $346 = ((($344)) + 4|0);
      $347 = HEAP32[$346>>2]|0;
      $348 = (($345) + ($347<<2)|0);
      $20 = $35;
      $349 = $20;
      $350 = ((($349)) + 4|0);
      $351 = HEAP32[$350>>2]|0;
      __THREW__ = 0;
      invoke_viiii(35,($323|0),($343|0),($348|0),($351|0));
      $352 = __THREW__; __THREW__ = 0;
      $353 = $352&1;
      if (!($353)) {
       break;
      }
     }
     $354 = ___cxa_find_matching_catch_2()|0;
     $355 = tempRet0;
     $33 = $354;
     $34 = $355;
     __ZNSt3__213__vector_baseIiNS_9allocatorIiEEED2Ev($323);
     $356 = $33;
     $357 = $34;
     $$sink1 = $357;$$sink2 = $356;
     break L6;
    }
   } while(0);
   HEAP32[$126>>2] = $127;
   $358 = ((($126)) + 4|0);
   HEAP32[$358>>2] = 6;
   ;HEAP8[$17>>0]=HEAP8[$126>>0]|0;HEAP8[$17+1>>0]=HEAP8[$126+1>>0]|0;HEAP8[$17+2>>0]=HEAP8[$126+2>>0]|0;HEAP8[$17+3>>0]=HEAP8[$126+3>>0]|0;HEAP8[$17+4>>0]=HEAP8[$126+4>>0]|0;HEAP8[$17+5>>0]=HEAP8[$126+5>>0]|0;HEAP8[$17+6>>0]=HEAP8[$126+6>>0]|0;HEAP8[$17+7>>0]=HEAP8[$126+7>>0]|0;
   $14 = 6672;
   $359 = $14;
   $13 = $359;
   $360 = $13;
   $12 = $360;
   HEAP32[$360>>2] = 0;
   $361 = ((($360)) + 4|0);
   HEAP32[$361>>2] = 0;
   $362 = ((($360)) + 8|0);
   $10 = $362;
   HEAP32[$11>>2] = 0;
   $363 = $10;
   $9 = $11;
   $364 = $9;
   $365 = HEAP32[$364>>2]|0;
   $7 = $363;
   HEAP32[$8>>2] = $365;
   $366 = $7;
   $6 = $366;
   $5 = $8;
   $367 = $5;
   $368 = HEAP32[$367>>2]|0;
   HEAP32[$366>>2] = $368;
   $4 = $17;
   $369 = $4;
   $370 = ((($369)) + 4|0);
   $371 = HEAP32[$370>>2]|0;
   $372 = ($371>>>0)>(0);
   do {
    if ($372) {
     $3 = $17;
     $373 = $3;
     $374 = ((($373)) + 4|0);
     $375 = HEAP32[$374>>2]|0;
     __THREW__ = 0;
     invoke_vii(36,($359|0),($375|0));
     $376 = __THREW__; __THREW__ = 0;
     $377 = $376&1;
     if (!($377)) {
      $0 = $17;
      $378 = $0;
      $379 = HEAP32[$378>>2]|0;
      $1 = $17;
      $380 = $1;
      $381 = HEAP32[$380>>2]|0;
      $382 = ((($380)) + 4|0);
      $383 = HEAP32[$382>>2]|0;
      $384 = (($381) + (($383*12)|0)|0);
      $2 = $17;
      $385 = $2;
      $386 = ((($385)) + 4|0);
      $387 = HEAP32[$386>>2]|0;
      __THREW__ = 0;
      invoke_viiii(37,($359|0),($379|0),($384|0),($387|0));
      $388 = __THREW__; __THREW__ = 0;
      $389 = $388&1;
      if (!($389)) {
       break;
      }
     }
     $390 = ___cxa_find_matching_catch_2()|0;
     $391 = tempRet0;
     $15 = $390;
     $16 = $391;
     __ZNSt3__213__vector_baseINS_6vectorIiNS_9allocatorIiEEEENS2_IS4_EEED2Ev($359);
     $392 = $15;
     $393 = $16;
     $130 = $392;
     $131 = $393;
     $394 = ((($127)) + 72|0);
     $405 = $394;
     while(1) {
      $404 = ((($405)) + -12|0);
      __ZNSt3__26vectorIiNS_9allocatorIiEEED2Ev($404);
      $406 = ($404|0)==($127|0);
      if ($406) {
       break;
      } else {
       $405 = $404;
      }
     }
     $407 = $130;
     $408 = $131;
     ___resumeException($407|0);
     // unreachable;
    }
   } while(0);
   $395 = ((($127)) + 72|0);
   $397 = $395;
   while(1) {
    $396 = ((($397)) + -12|0);
    __ZNSt3__26vectorIiNS_9allocatorIiEEED2Ev($396);
    $398 = ($396|0)==($127|0);
    if ($398) {
     break;
    } else {
     $397 = $396;
    }
   }
   (___cxa_atexit((38|0),(6672|0),(___dso_handle|0))|0);
   STACKTOP = sp;return;
  }
 } while(0);
 $130 = $$sink2;
 $131 = $$sink1;
 $399 = $128;
 $400 = ($127|0)==($399|0);
 if ($400) {
  $407 = $130;
  $408 = $131;
  ___resumeException($407|0);
  // unreachable;
 } else {
  $402 = $399;
 }
 while(1) {
  $401 = ((($402)) + -12|0);
  __ZNSt3__26vectorIiNS_9allocatorIiEEED2Ev($401);
  $403 = ($401|0)==($127|0);
  if ($403) {
   break;
  } else {
   $402 = $401;
  }
 }
 $407 = $130;
 $408 = $131;
 ___resumeException($407|0);
 // unreachable;
}
function __ZNSt3__26vectorIiNS_9allocatorIiEEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 __ZNSt3__213__vector_baseIiNS_9allocatorIiEEED2Ev($2);
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 __ZNSt3__213__vector_baseINS_6vectorIiNS_9allocatorIiEEEENS2_IS4_EEED2Ev($2);
 STACKTOP = sp;return;
}
function ___cxx_global_var_init_6() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 96|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(96|0);
 $8 = sp + 48|0;
 $11 = sp + 36|0;
 $17 = sp;
 $18 = sp + 8|0;
 HEAP32[$18>>2] = 672;
 $19 = ((($18)) + 4|0);
 HEAP32[$19>>2] = 8;
 ;HEAP8[$17>>0]=HEAP8[$18>>0]|0;HEAP8[$17+1>>0]=HEAP8[$18+1>>0]|0;HEAP8[$17+2>>0]=HEAP8[$18+2>>0]|0;HEAP8[$17+3>>0]=HEAP8[$18+3>>0]|0;HEAP8[$17+4>>0]=HEAP8[$18+4>>0]|0;HEAP8[$17+5>>0]=HEAP8[$18+5>>0]|0;HEAP8[$17+6>>0]=HEAP8[$18+6>>0]|0;HEAP8[$17+7>>0]=HEAP8[$18+7>>0]|0;
 $14 = 6684;
 $20 = $14;
 $13 = $20;
 $21 = $13;
 $12 = $21;
 HEAP32[$21>>2] = 0;
 $22 = ((($21)) + 4|0);
 HEAP32[$22>>2] = 0;
 $23 = ((($21)) + 8|0);
 $10 = $23;
 HEAP32[$11>>2] = 0;
 $24 = $10;
 $9 = $11;
 $25 = $9;
 $26 = HEAP32[$25>>2]|0;
 $7 = $24;
 HEAP32[$8>>2] = $26;
 $27 = $7;
 $6 = $27;
 $5 = $8;
 $28 = $5;
 $29 = HEAP32[$28>>2]|0;
 HEAP32[$27>>2] = $29;
 $4 = $17;
 $30 = $4;
 $31 = ((($30)) + 4|0);
 $32 = HEAP32[$31>>2]|0;
 $33 = ($32>>>0)>(0);
 if (!($33)) {
  (___cxa_atexit((41|0),(6684|0),(___dso_handle|0))|0);
  STACKTOP = sp;return;
 }
 $3 = $17;
 $34 = $3;
 $35 = ((($34)) + 4|0);
 $36 = HEAP32[$35>>2]|0;
 __THREW__ = 0;
 invoke_vii(39,($20|0),($36|0));
 $37 = __THREW__; __THREW__ = 0;
 $38 = $37&1;
 if ($38) {
  $51 = ___cxa_find_matching_catch_2()|0;
  $52 = tempRet0;
  $15 = $51;
  $16 = $52;
  __ZNSt3__213__vector_baseIfNS_9allocatorIfEEED2Ev($20);
  $53 = $15;
  $54 = $16;
  ___resumeException($53|0);
  // unreachable;
 }
 $0 = $17;
 $39 = $0;
 $40 = HEAP32[$39>>2]|0;
 $1 = $17;
 $41 = $1;
 $42 = HEAP32[$41>>2]|0;
 $43 = ((($41)) + 4|0);
 $44 = HEAP32[$43>>2]|0;
 $45 = (($42) + ($44<<2)|0);
 $2 = $17;
 $46 = $2;
 $47 = ((($46)) + 4|0);
 $48 = HEAP32[$47>>2]|0;
 __THREW__ = 0;
 invoke_viiii(40,($20|0),($40|0),($45|0),($48|0));
 $49 = __THREW__; __THREW__ = 0;
 $50 = $49&1;
 if ($50) {
  $51 = ___cxa_find_matching_catch_2()|0;
  $52 = tempRet0;
  $15 = $51;
  $16 = $52;
  __ZNSt3__213__vector_baseIfNS_9allocatorIfEEED2Ev($20);
  $53 = $15;
  $54 = $16;
  ___resumeException($53|0);
  // unreachable;
 } else {
  (___cxa_atexit((41|0),(6684|0),(___dso_handle|0))|0);
  STACKTOP = sp;return;
 }
}
function __ZNSt3__26vectorIfNS_9allocatorIfEEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 __ZNSt3__213__vector_baseIfNS_9allocatorIfEEED2Ev($2);
 STACKTOP = sp;return;
}
function ___cxx_global_var_init_8() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 96|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(96|0);
 $8 = sp + 48|0;
 $11 = sp + 36|0;
 $17 = sp;
 $18 = sp + 8|0;
 HEAP32[$18>>2] = 704;
 $19 = ((($18)) + 4|0);
 HEAP32[$19>>2] = 8;
 ;HEAP8[$17>>0]=HEAP8[$18>>0]|0;HEAP8[$17+1>>0]=HEAP8[$18+1>>0]|0;HEAP8[$17+2>>0]=HEAP8[$18+2>>0]|0;HEAP8[$17+3>>0]=HEAP8[$18+3>>0]|0;HEAP8[$17+4>>0]=HEAP8[$18+4>>0]|0;HEAP8[$17+5>>0]=HEAP8[$18+5>>0]|0;HEAP8[$17+6>>0]=HEAP8[$18+6>>0]|0;HEAP8[$17+7>>0]=HEAP8[$18+7>>0]|0;
 $14 = 6696;
 $20 = $14;
 $13 = $20;
 $21 = $13;
 $12 = $21;
 HEAP32[$21>>2] = 0;
 $22 = ((($21)) + 4|0);
 HEAP32[$22>>2] = 0;
 $23 = ((($21)) + 8|0);
 $10 = $23;
 HEAP32[$11>>2] = 0;
 $24 = $10;
 $9 = $11;
 $25 = $9;
 $26 = HEAP32[$25>>2]|0;
 $7 = $24;
 HEAP32[$8>>2] = $26;
 $27 = $7;
 $6 = $27;
 $5 = $8;
 $28 = $5;
 $29 = HEAP32[$28>>2]|0;
 HEAP32[$27>>2] = $29;
 $4 = $17;
 $30 = $4;
 $31 = ((($30)) + 4|0);
 $32 = HEAP32[$31>>2]|0;
 $33 = ($32>>>0)>(0);
 if (!($33)) {
  (___cxa_atexit((41|0),(6696|0),(___dso_handle|0))|0);
  STACKTOP = sp;return;
 }
 $3 = $17;
 $34 = $3;
 $35 = ((($34)) + 4|0);
 $36 = HEAP32[$35>>2]|0;
 __THREW__ = 0;
 invoke_vii(39,($20|0),($36|0));
 $37 = __THREW__; __THREW__ = 0;
 $38 = $37&1;
 if ($38) {
  $51 = ___cxa_find_matching_catch_2()|0;
  $52 = tempRet0;
  $15 = $51;
  $16 = $52;
  __ZNSt3__213__vector_baseIfNS_9allocatorIfEEED2Ev($20);
  $53 = $15;
  $54 = $16;
  ___resumeException($53|0);
  // unreachable;
 }
 $0 = $17;
 $39 = $0;
 $40 = HEAP32[$39>>2]|0;
 $1 = $17;
 $41 = $1;
 $42 = HEAP32[$41>>2]|0;
 $43 = ((($41)) + 4|0);
 $44 = HEAP32[$43>>2]|0;
 $45 = (($42) + ($44<<2)|0);
 $2 = $17;
 $46 = $2;
 $47 = ((($46)) + 4|0);
 $48 = HEAP32[$47>>2]|0;
 __THREW__ = 0;
 invoke_viiii(40,($20|0),($40|0),($45|0),($48|0));
 $49 = __THREW__; __THREW__ = 0;
 $50 = $49&1;
 if ($50) {
  $51 = ___cxa_find_matching_catch_2()|0;
  $52 = tempRet0;
  $15 = $51;
  $16 = $52;
  __ZNSt3__213__vector_baseIfNS_9allocatorIfEEED2Ev($20);
  $53 = $15;
  $54 = $16;
  ___resumeException($53|0);
  // unreachable;
 } else {
  (___cxa_atexit((41|0),(6696|0),(___dso_handle|0))|0);
  STACKTOP = sp;return;
 }
}
function ___cxx_global_var_init_10() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 96|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(96|0);
 $8 = sp + 48|0;
 $11 = sp + 36|0;
 $17 = sp;
 $18 = sp + 8|0;
 HEAP32[$18>>2] = 736;
 $19 = ((($18)) + 4|0);
 HEAP32[$19>>2] = 8;
 ;HEAP8[$17>>0]=HEAP8[$18>>0]|0;HEAP8[$17+1>>0]=HEAP8[$18+1>>0]|0;HEAP8[$17+2>>0]=HEAP8[$18+2>>0]|0;HEAP8[$17+3>>0]=HEAP8[$18+3>>0]|0;HEAP8[$17+4>>0]=HEAP8[$18+4>>0]|0;HEAP8[$17+5>>0]=HEAP8[$18+5>>0]|0;HEAP8[$17+6>>0]=HEAP8[$18+6>>0]|0;HEAP8[$17+7>>0]=HEAP8[$18+7>>0]|0;
 $14 = 6708;
 $20 = $14;
 $13 = $20;
 $21 = $13;
 $12 = $21;
 HEAP32[$21>>2] = 0;
 $22 = ((($21)) + 4|0);
 HEAP32[$22>>2] = 0;
 $23 = ((($21)) + 8|0);
 $10 = $23;
 HEAP32[$11>>2] = 0;
 $24 = $10;
 $9 = $11;
 $25 = $9;
 $26 = HEAP32[$25>>2]|0;
 $7 = $24;
 HEAP32[$8>>2] = $26;
 $27 = $7;
 $6 = $27;
 $5 = $8;
 $28 = $5;
 $29 = HEAP32[$28>>2]|0;
 HEAP32[$27>>2] = $29;
 $4 = $17;
 $30 = $4;
 $31 = ((($30)) + 4|0);
 $32 = HEAP32[$31>>2]|0;
 $33 = ($32>>>0)>(0);
 if (!($33)) {
  (___cxa_atexit((41|0),(6708|0),(___dso_handle|0))|0);
  STACKTOP = sp;return;
 }
 $3 = $17;
 $34 = $3;
 $35 = ((($34)) + 4|0);
 $36 = HEAP32[$35>>2]|0;
 __THREW__ = 0;
 invoke_vii(39,($20|0),($36|0));
 $37 = __THREW__; __THREW__ = 0;
 $38 = $37&1;
 if ($38) {
  $51 = ___cxa_find_matching_catch_2()|0;
  $52 = tempRet0;
  $15 = $51;
  $16 = $52;
  __ZNSt3__213__vector_baseIfNS_9allocatorIfEEED2Ev($20);
  $53 = $15;
  $54 = $16;
  ___resumeException($53|0);
  // unreachable;
 }
 $0 = $17;
 $39 = $0;
 $40 = HEAP32[$39>>2]|0;
 $1 = $17;
 $41 = $1;
 $42 = HEAP32[$41>>2]|0;
 $43 = ((($41)) + 4|0);
 $44 = HEAP32[$43>>2]|0;
 $45 = (($42) + ($44<<2)|0);
 $2 = $17;
 $46 = $2;
 $47 = ((($46)) + 4|0);
 $48 = HEAP32[$47>>2]|0;
 __THREW__ = 0;
 invoke_viiii(40,($20|0),($40|0),($45|0),($48|0));
 $49 = __THREW__; __THREW__ = 0;
 $50 = $49&1;
 if ($50) {
  $51 = ___cxa_find_matching_catch_2()|0;
  $52 = tempRet0;
  $15 = $51;
  $16 = $52;
  __ZNSt3__213__vector_baseIfNS_9allocatorIfEEED2Ev($20);
  $53 = $15;
  $54 = $16;
  ___resumeException($53|0);
  // unreachable;
 } else {
  (___cxa_atexit((41|0),(6708|0),(___dso_handle|0))|0);
  STACKTOP = sp;return;
 }
}
function ___cxx_global_var_init_12() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 96|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(96|0);
 $8 = sp + 48|0;
 $11 = sp + 36|0;
 $17 = sp;
 $18 = sp + 8|0;
 HEAP32[$18>>2] = 768;
 $19 = ((($18)) + 4|0);
 HEAP32[$19>>2] = 8;
 ;HEAP8[$17>>0]=HEAP8[$18>>0]|0;HEAP8[$17+1>>0]=HEAP8[$18+1>>0]|0;HEAP8[$17+2>>0]=HEAP8[$18+2>>0]|0;HEAP8[$17+3>>0]=HEAP8[$18+3>>0]|0;HEAP8[$17+4>>0]=HEAP8[$18+4>>0]|0;HEAP8[$17+5>>0]=HEAP8[$18+5>>0]|0;HEAP8[$17+6>>0]=HEAP8[$18+6>>0]|0;HEAP8[$17+7>>0]=HEAP8[$18+7>>0]|0;
 $14 = 6720;
 $20 = $14;
 $13 = $20;
 $21 = $13;
 $12 = $21;
 HEAP32[$21>>2] = 0;
 $22 = ((($21)) + 4|0);
 HEAP32[$22>>2] = 0;
 $23 = ((($21)) + 8|0);
 $10 = $23;
 HEAP32[$11>>2] = 0;
 $24 = $10;
 $9 = $11;
 $25 = $9;
 $26 = HEAP32[$25>>2]|0;
 $7 = $24;
 HEAP32[$8>>2] = $26;
 $27 = $7;
 $6 = $27;
 $5 = $8;
 $28 = $5;
 $29 = HEAP32[$28>>2]|0;
 HEAP32[$27>>2] = $29;
 $4 = $17;
 $30 = $4;
 $31 = ((($30)) + 4|0);
 $32 = HEAP32[$31>>2]|0;
 $33 = ($32>>>0)>(0);
 if (!($33)) {
  (___cxa_atexit((41|0),(6720|0),(___dso_handle|0))|0);
  STACKTOP = sp;return;
 }
 $3 = $17;
 $34 = $3;
 $35 = ((($34)) + 4|0);
 $36 = HEAP32[$35>>2]|0;
 __THREW__ = 0;
 invoke_vii(39,($20|0),($36|0));
 $37 = __THREW__; __THREW__ = 0;
 $38 = $37&1;
 if ($38) {
  $51 = ___cxa_find_matching_catch_2()|0;
  $52 = tempRet0;
  $15 = $51;
  $16 = $52;
  __ZNSt3__213__vector_baseIfNS_9allocatorIfEEED2Ev($20);
  $53 = $15;
  $54 = $16;
  ___resumeException($53|0);
  // unreachable;
 }
 $0 = $17;
 $39 = $0;
 $40 = HEAP32[$39>>2]|0;
 $1 = $17;
 $41 = $1;
 $42 = HEAP32[$41>>2]|0;
 $43 = ((($41)) + 4|0);
 $44 = HEAP32[$43>>2]|0;
 $45 = (($42) + ($44<<2)|0);
 $2 = $17;
 $46 = $2;
 $47 = ((($46)) + 4|0);
 $48 = HEAP32[$47>>2]|0;
 __THREW__ = 0;
 invoke_viiii(40,($20|0),($40|0),($45|0),($48|0));
 $49 = __THREW__; __THREW__ = 0;
 $50 = $49&1;
 if ($50) {
  $51 = ___cxa_find_matching_catch_2()|0;
  $52 = tempRet0;
  $15 = $51;
  $16 = $52;
  __ZNSt3__213__vector_baseIfNS_9allocatorIfEEED2Ev($20);
  $53 = $15;
  $54 = $16;
  ___resumeException($53|0);
  // unreachable;
 } else {
  (___cxa_atexit((41|0),(6720|0),(___dso_handle|0))|0);
  STACKTOP = sp;return;
 }
}
function ___cxx_global_var_init_14() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0;
 var $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 176|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(176|0);
 $8 = sp + 136|0;
 $11 = sp + 124|0;
 $17 = sp;
 $18 = sp + 96|0;
 $19 = sp + 24|0;
 $20 = $19;
 __THREW__ = 0;
 invoke_vii(42,($19|0),(6696|0));
 $23 = __THREW__; __THREW__ = 0;
 $24 = $23&1;
 if (!($24)) {
  $25 = ((($19)) + 12|0);
  $20 = $25;
  __THREW__ = 0;
  invoke_vii(42,($25|0),(6696|0));
  $26 = __THREW__; __THREW__ = 0;
  $27 = $26&1;
  if (!($27)) {
   $28 = ((($25)) + 12|0);
   $20 = $28;
   __THREW__ = 0;
   invoke_vii(42,($28|0),(6684|0));
   $29 = __THREW__; __THREW__ = 0;
   $30 = $29&1;
   if (!($30)) {
    $31 = ((($28)) + 12|0);
    $20 = $31;
    __THREW__ = 0;
    invoke_vii(42,($31|0),(6708|0));
    $32 = __THREW__; __THREW__ = 0;
    $33 = $32&1;
    if (!($33)) {
     $34 = ((($31)) + 12|0);
     $20 = $34;
     __THREW__ = 0;
     invoke_vii(42,($34|0),(6696|0));
     $35 = __THREW__; __THREW__ = 0;
     $36 = $35&1;
     if (!($36)) {
      $37 = ((($34)) + 12|0);
      $20 = $37;
      __THREW__ = 0;
      invoke_vii(42,($37|0),(6696|0));
      $38 = __THREW__; __THREW__ = 0;
      $39 = $38&1;
      if (!($39)) {
       HEAP32[$18>>2] = $19;
       $40 = ((($18)) + 4|0);
       HEAP32[$40>>2] = 6;
       ;HEAP8[$17>>0]=HEAP8[$18>>0]|0;HEAP8[$17+1>>0]=HEAP8[$18+1>>0]|0;HEAP8[$17+2>>0]=HEAP8[$18+2>>0]|0;HEAP8[$17+3>>0]=HEAP8[$18+3>>0]|0;HEAP8[$17+4>>0]=HEAP8[$18+4>>0]|0;HEAP8[$17+5>>0]=HEAP8[$18+5>>0]|0;HEAP8[$17+6>>0]=HEAP8[$18+6>>0]|0;HEAP8[$17+7>>0]=HEAP8[$18+7>>0]|0;
       $14 = 6732;
       $41 = $14;
       $13 = $41;
       $42 = $13;
       $12 = $42;
       HEAP32[$42>>2] = 0;
       $43 = ((($42)) + 4|0);
       HEAP32[$43>>2] = 0;
       $44 = ((($42)) + 8|0);
       $10 = $44;
       HEAP32[$11>>2] = 0;
       $45 = $10;
       $9 = $11;
       $46 = $9;
       $47 = HEAP32[$46>>2]|0;
       $7 = $45;
       HEAP32[$8>>2] = $47;
       $48 = $7;
       $6 = $48;
       $5 = $8;
       $49 = $5;
       $50 = HEAP32[$49>>2]|0;
       HEAP32[$48>>2] = $50;
       $4 = $17;
       $51 = $4;
       $52 = ((($51)) + 4|0);
       $53 = HEAP32[$52>>2]|0;
       $54 = ($53>>>0)>(0);
       do {
        if ($54) {
         $3 = $17;
         $55 = $3;
         $56 = ((($55)) + 4|0);
         $57 = HEAP32[$56>>2]|0;
         __THREW__ = 0;
         invoke_vii(43,($41|0),($57|0));
         $58 = __THREW__; __THREW__ = 0;
         $59 = $58&1;
         if (!($59)) {
          $0 = $17;
          $60 = $0;
          $61 = HEAP32[$60>>2]|0;
          $1 = $17;
          $62 = $1;
          $63 = HEAP32[$62>>2]|0;
          $64 = ((($62)) + 4|0);
          $65 = HEAP32[$64>>2]|0;
          $66 = (($63) + (($65*12)|0)|0);
          $2 = $17;
          $67 = $2;
          $68 = ((($67)) + 4|0);
          $69 = HEAP32[$68>>2]|0;
          __THREW__ = 0;
          invoke_viiii(44,($41|0),($61|0),($66|0),($69|0));
          $70 = __THREW__; __THREW__ = 0;
          $71 = $70&1;
          if (!($71)) {
           break;
          }
         }
         $72 = ___cxa_find_matching_catch_2()|0;
         $73 = tempRet0;
         $15 = $72;
         $16 = $73;
         __ZNSt3__213__vector_baseINS_6vectorIfNS_9allocatorIfEEEENS2_IS4_EEED2Ev($41);
         $74 = $15;
         $75 = $16;
         $21 = $74;
         $22 = $75;
         $76 = ((($19)) + 72|0);
         $89 = $76;
         while(1) {
          $88 = ((($89)) + -12|0);
          __ZNSt3__26vectorIfNS_9allocatorIfEEED2Ev($88);
          $90 = ($88|0)==($19|0);
          if ($90) {
           break;
          } else {
           $89 = $88;
          }
         }
         $91 = $21;
         $92 = $22;
         ___resumeException($91|0);
         // unreachable;
        }
       } while(0);
       $77 = ((($19)) + 72|0);
       $79 = $77;
       while(1) {
        $78 = ((($79)) + -12|0);
        __ZNSt3__26vectorIfNS_9allocatorIfEEED2Ev($78);
        $80 = ($78|0)==($19|0);
        if ($80) {
         break;
        } else {
         $79 = $78;
        }
       }
       (___cxa_atexit((45|0),(6732|0),(___dso_handle|0))|0);
       STACKTOP = sp;return;
      }
     }
    }
   }
  }
 }
 $81 = ___cxa_find_matching_catch_2()|0;
 $82 = tempRet0;
 $21 = $81;
 $22 = $82;
 $83 = $20;
 $84 = ($19|0)==($83|0);
 if ($84) {
  $91 = $21;
  $92 = $22;
  ___resumeException($91|0);
  // unreachable;
 } else {
  $86 = $83;
 }
 while(1) {
  $85 = ((($86)) + -12|0);
  __ZNSt3__26vectorIfNS_9allocatorIfEEED2Ev($85);
  $87 = ($85|0)==($19|0);
  if ($87) {
   break;
  } else {
   $86 = $85;
  }
 }
 $91 = $21;
 $92 = $22;
 ___resumeException($91|0);
 // unreachable;
}
function __ZNSt3__26vectorIfNS_9allocatorIfEEEC2ERKS3_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0;
 var $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 112|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(112|0);
 $7 = sp + 84|0;
 $8 = sp + 16|0;
 $11 = sp + 72|0;
 $12 = sp + 111|0;
 $13 = sp + 8|0;
 $17 = sp + 110|0;
 $19 = sp;
 $21 = sp + 109|0;
 $27 = sp + 108|0;
 $25 = $0;
 $26 = $1;
 $31 = $25;
 $32 = $26;
 $24 = $32;
 $33 = $24;
 $34 = ((($33)) + 8|0);
 $23 = $34;
 $35 = $23;
 $22 = $35;
 $36 = $22;
 $20 = $36;
 $37 = $20;
 ;HEAP8[$19>>0]=HEAP8[$21>>0]|0;
 $18 = $37;
 $15 = $31;
 $16 = $27;
 $38 = $15;
 $14 = $38;
 HEAP32[$38>>2] = 0;
 $39 = ((($38)) + 4|0);
 HEAP32[$39>>2] = 0;
 $40 = ((($38)) + 8|0);
 ;HEAP8[$13>>0]=HEAP8[$17>>0]|0;
 $10 = $40;
 HEAP32[$11>>2] = 0;
 $41 = $10;
 $9 = $11;
 $42 = $9;
 $43 = HEAP32[$42>>2]|0;
 $3 = $13;
 ;HEAP8[$8>>0]=HEAP8[$12>>0]|0;
 $6 = $41;
 HEAP32[$7>>2] = $43;
 $44 = $6;
 $5 = $8;
 $4 = $7;
 $45 = $4;
 $46 = HEAP32[$45>>2]|0;
 HEAP32[$44>>2] = $46;
 $47 = $26;
 $2 = $47;
 $48 = $2;
 $49 = ((($48)) + 4|0);
 $50 = HEAP32[$49>>2]|0;
 $51 = HEAP32[$48>>2]|0;
 $52 = $50;
 $53 = $51;
 $54 = (($52) - ($53))|0;
 $55 = (($54|0) / 4)&-1;
 $28 = $55;
 $56 = $28;
 $57 = ($56>>>0)>(0);
 if (!($57)) {
  STACKTOP = sp;return;
 }
 $58 = $28;
 __THREW__ = 0;
 invoke_vii(39,($31|0),($58|0));
 $59 = __THREW__; __THREW__ = 0;
 $60 = $59&1;
 if ($60) {
  $69 = ___cxa_find_matching_catch_2()|0;
  $70 = tempRet0;
  $29 = $69;
  $30 = $70;
  __ZNSt3__213__vector_baseIfNS_9allocatorIfEEED2Ev($31);
  $71 = $29;
  $72 = $30;
  ___resumeException($71|0);
  // unreachable;
 }
 $61 = $26;
 $62 = HEAP32[$61>>2]|0;
 $63 = $26;
 $64 = ((($63)) + 4|0);
 $65 = HEAP32[$64>>2]|0;
 $66 = $28;
 __THREW__ = 0;
 invoke_viiii(46,($31|0),($62|0),($65|0),($66|0));
 $67 = __THREW__; __THREW__ = 0;
 $68 = $67&1;
 if ($68) {
  $69 = ___cxa_find_matching_catch_2()|0;
  $70 = tempRet0;
  $29 = $69;
  $30 = $70;
  __ZNSt3__213__vector_baseIfNS_9allocatorIfEEED2Ev($31);
  $71 = $29;
  $72 = $30;
  ___resumeException($71|0);
  // unreachable;
 } else {
  STACKTOP = sp;return;
 }
}
function __ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 __ZNSt3__213__vector_baseINS_6vectorIfNS_9allocatorIfEEEENS2_IS4_EEED2Ev($2);
 STACKTOP = sp;return;
}
function ___cxx_global_var_init_15() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0;
 var $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 176|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(176|0);
 $8 = sp + 136|0;
 $11 = sp + 124|0;
 $17 = sp;
 $18 = sp + 96|0;
 $19 = sp + 24|0;
 $20 = $19;
 __THREW__ = 0;
 invoke_vii(42,($19|0),(6720|0));
 $23 = __THREW__; __THREW__ = 0;
 $24 = $23&1;
 if (!($24)) {
  $25 = ((($19)) + 12|0);
  $20 = $25;
  __THREW__ = 0;
  invoke_vii(42,($25|0),(6720|0));
  $26 = __THREW__; __THREW__ = 0;
  $27 = $26&1;
  if (!($27)) {
   $28 = ((($25)) + 12|0);
   $20 = $28;
   __THREW__ = 0;
   invoke_vii(42,($28|0),(6720|0));
   $29 = __THREW__; __THREW__ = 0;
   $30 = $29&1;
   if (!($30)) {
    $31 = ((($28)) + 12|0);
    $20 = $31;
    __THREW__ = 0;
    invoke_vii(42,($31|0),(6720|0));
    $32 = __THREW__; __THREW__ = 0;
    $33 = $32&1;
    if (!($33)) {
     $34 = ((($31)) + 12|0);
     $20 = $34;
     __THREW__ = 0;
     invoke_vii(42,($34|0),(6720|0));
     $35 = __THREW__; __THREW__ = 0;
     $36 = $35&1;
     if (!($36)) {
      $37 = ((($34)) + 12|0);
      $20 = $37;
      __THREW__ = 0;
      invoke_vii(42,($37|0),(6720|0));
      $38 = __THREW__; __THREW__ = 0;
      $39 = $38&1;
      if (!($39)) {
       HEAP32[$18>>2] = $19;
       $40 = ((($18)) + 4|0);
       HEAP32[$40>>2] = 6;
       ;HEAP8[$17>>0]=HEAP8[$18>>0]|0;HEAP8[$17+1>>0]=HEAP8[$18+1>>0]|0;HEAP8[$17+2>>0]=HEAP8[$18+2>>0]|0;HEAP8[$17+3>>0]=HEAP8[$18+3>>0]|0;HEAP8[$17+4>>0]=HEAP8[$18+4>>0]|0;HEAP8[$17+5>>0]=HEAP8[$18+5>>0]|0;HEAP8[$17+6>>0]=HEAP8[$18+6>>0]|0;HEAP8[$17+7>>0]=HEAP8[$18+7>>0]|0;
       $14 = 6744;
       $41 = $14;
       $13 = $41;
       $42 = $13;
       $12 = $42;
       HEAP32[$42>>2] = 0;
       $43 = ((($42)) + 4|0);
       HEAP32[$43>>2] = 0;
       $44 = ((($42)) + 8|0);
       $10 = $44;
       HEAP32[$11>>2] = 0;
       $45 = $10;
       $9 = $11;
       $46 = $9;
       $47 = HEAP32[$46>>2]|0;
       $7 = $45;
       HEAP32[$8>>2] = $47;
       $48 = $7;
       $6 = $48;
       $5 = $8;
       $49 = $5;
       $50 = HEAP32[$49>>2]|0;
       HEAP32[$48>>2] = $50;
       $4 = $17;
       $51 = $4;
       $52 = ((($51)) + 4|0);
       $53 = HEAP32[$52>>2]|0;
       $54 = ($53>>>0)>(0);
       do {
        if ($54) {
         $3 = $17;
         $55 = $3;
         $56 = ((($55)) + 4|0);
         $57 = HEAP32[$56>>2]|0;
         __THREW__ = 0;
         invoke_vii(43,($41|0),($57|0));
         $58 = __THREW__; __THREW__ = 0;
         $59 = $58&1;
         if (!($59)) {
          $0 = $17;
          $60 = $0;
          $61 = HEAP32[$60>>2]|0;
          $1 = $17;
          $62 = $1;
          $63 = HEAP32[$62>>2]|0;
          $64 = ((($62)) + 4|0);
          $65 = HEAP32[$64>>2]|0;
          $66 = (($63) + (($65*12)|0)|0);
          $2 = $17;
          $67 = $2;
          $68 = ((($67)) + 4|0);
          $69 = HEAP32[$68>>2]|0;
          __THREW__ = 0;
          invoke_viiii(44,($41|0),($61|0),($66|0),($69|0));
          $70 = __THREW__; __THREW__ = 0;
          $71 = $70&1;
          if (!($71)) {
           break;
          }
         }
         $72 = ___cxa_find_matching_catch_2()|0;
         $73 = tempRet0;
         $15 = $72;
         $16 = $73;
         __ZNSt3__213__vector_baseINS_6vectorIfNS_9allocatorIfEEEENS2_IS4_EEED2Ev($41);
         $74 = $15;
         $75 = $16;
         $21 = $74;
         $22 = $75;
         $76 = ((($19)) + 72|0);
         $89 = $76;
         while(1) {
          $88 = ((($89)) + -12|0);
          __ZNSt3__26vectorIfNS_9allocatorIfEEED2Ev($88);
          $90 = ($88|0)==($19|0);
          if ($90) {
           break;
          } else {
           $89 = $88;
          }
         }
         $91 = $21;
         $92 = $22;
         ___resumeException($91|0);
         // unreachable;
        }
       } while(0);
       $77 = ((($19)) + 72|0);
       $79 = $77;
       while(1) {
        $78 = ((($79)) + -12|0);
        __ZNSt3__26vectorIfNS_9allocatorIfEEED2Ev($78);
        $80 = ($78|0)==($19|0);
        if ($80) {
         break;
        } else {
         $79 = $78;
        }
       }
       (___cxa_atexit((45|0),(6744|0),(___dso_handle|0))|0);
       STACKTOP = sp;return;
      }
     }
    }
   }
  }
 }
 $81 = ___cxa_find_matching_catch_2()|0;
 $82 = tempRet0;
 $21 = $81;
 $22 = $82;
 $83 = $20;
 $84 = ($19|0)==($83|0);
 if ($84) {
  $91 = $21;
  $92 = $22;
  ___resumeException($91|0);
  // unreachable;
 } else {
  $86 = $83;
 }
 while(1) {
  $85 = ((($86)) + -12|0);
  __ZNSt3__26vectorIfNS_9allocatorIfEEED2Ev($85);
  $87 = ($85|0)==($19|0);
  if ($87) {
   break;
  } else {
   $86 = $85;
  }
 }
 $91 = $21;
 $92 = $22;
 ___resumeException($91|0);
 // unreachable;
}
function ___cxx_global_var_init_16() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0;
 var $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 176|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(176|0);
 $8 = sp + 136|0;
 $11 = sp + 124|0;
 $17 = sp;
 $18 = sp + 96|0;
 $19 = sp + 24|0;
 $20 = $19;
 __THREW__ = 0;
 invoke_vii(42,($19|0),(6708|0));
 $23 = __THREW__; __THREW__ = 0;
 $24 = $23&1;
 if (!($24)) {
  $25 = ((($19)) + 12|0);
  $20 = $25;
  __THREW__ = 0;
  invoke_vii(42,($25|0),(6708|0));
  $26 = __THREW__; __THREW__ = 0;
  $27 = $26&1;
  if (!($27)) {
   $28 = ((($25)) + 12|0);
   $20 = $28;
   __THREW__ = 0;
   invoke_vii(42,($28|0),(6708|0));
   $29 = __THREW__; __THREW__ = 0;
   $30 = $29&1;
   if (!($30)) {
    $31 = ((($28)) + 12|0);
    $20 = $31;
    __THREW__ = 0;
    invoke_vii(42,($31|0),(6708|0));
    $32 = __THREW__; __THREW__ = 0;
    $33 = $32&1;
    if (!($33)) {
     $34 = ((($31)) + 12|0);
     $20 = $34;
     __THREW__ = 0;
     invoke_vii(42,($34|0),(6708|0));
     $35 = __THREW__; __THREW__ = 0;
     $36 = $35&1;
     if (!($36)) {
      $37 = ((($34)) + 12|0);
      $20 = $37;
      __THREW__ = 0;
      invoke_vii(42,($37|0),(6708|0));
      $38 = __THREW__; __THREW__ = 0;
      $39 = $38&1;
      if (!($39)) {
       HEAP32[$18>>2] = $19;
       $40 = ((($18)) + 4|0);
       HEAP32[$40>>2] = 6;
       ;HEAP8[$17>>0]=HEAP8[$18>>0]|0;HEAP8[$17+1>>0]=HEAP8[$18+1>>0]|0;HEAP8[$17+2>>0]=HEAP8[$18+2>>0]|0;HEAP8[$17+3>>0]=HEAP8[$18+3>>0]|0;HEAP8[$17+4>>0]=HEAP8[$18+4>>0]|0;HEAP8[$17+5>>0]=HEAP8[$18+5>>0]|0;HEAP8[$17+6>>0]=HEAP8[$18+6>>0]|0;HEAP8[$17+7>>0]=HEAP8[$18+7>>0]|0;
       $14 = 6756;
       $41 = $14;
       $13 = $41;
       $42 = $13;
       $12 = $42;
       HEAP32[$42>>2] = 0;
       $43 = ((($42)) + 4|0);
       HEAP32[$43>>2] = 0;
       $44 = ((($42)) + 8|0);
       $10 = $44;
       HEAP32[$11>>2] = 0;
       $45 = $10;
       $9 = $11;
       $46 = $9;
       $47 = HEAP32[$46>>2]|0;
       $7 = $45;
       HEAP32[$8>>2] = $47;
       $48 = $7;
       $6 = $48;
       $5 = $8;
       $49 = $5;
       $50 = HEAP32[$49>>2]|0;
       HEAP32[$48>>2] = $50;
       $4 = $17;
       $51 = $4;
       $52 = ((($51)) + 4|0);
       $53 = HEAP32[$52>>2]|0;
       $54 = ($53>>>0)>(0);
       do {
        if ($54) {
         $3 = $17;
         $55 = $3;
         $56 = ((($55)) + 4|0);
         $57 = HEAP32[$56>>2]|0;
         __THREW__ = 0;
         invoke_vii(43,($41|0),($57|0));
         $58 = __THREW__; __THREW__ = 0;
         $59 = $58&1;
         if (!($59)) {
          $0 = $17;
          $60 = $0;
          $61 = HEAP32[$60>>2]|0;
          $1 = $17;
          $62 = $1;
          $63 = HEAP32[$62>>2]|0;
          $64 = ((($62)) + 4|0);
          $65 = HEAP32[$64>>2]|0;
          $66 = (($63) + (($65*12)|0)|0);
          $2 = $17;
          $67 = $2;
          $68 = ((($67)) + 4|0);
          $69 = HEAP32[$68>>2]|0;
          __THREW__ = 0;
          invoke_viiii(44,($41|0),($61|0),($66|0),($69|0));
          $70 = __THREW__; __THREW__ = 0;
          $71 = $70&1;
          if (!($71)) {
           break;
          }
         }
         $72 = ___cxa_find_matching_catch_2()|0;
         $73 = tempRet0;
         $15 = $72;
         $16 = $73;
         __ZNSt3__213__vector_baseINS_6vectorIfNS_9allocatorIfEEEENS2_IS4_EEED2Ev($41);
         $74 = $15;
         $75 = $16;
         $21 = $74;
         $22 = $75;
         $76 = ((($19)) + 72|0);
         $89 = $76;
         while(1) {
          $88 = ((($89)) + -12|0);
          __ZNSt3__26vectorIfNS_9allocatorIfEEED2Ev($88);
          $90 = ($88|0)==($19|0);
          if ($90) {
           break;
          } else {
           $89 = $88;
          }
         }
         $91 = $21;
         $92 = $22;
         ___resumeException($91|0);
         // unreachable;
        }
       } while(0);
       $77 = ((($19)) + 72|0);
       $79 = $77;
       while(1) {
        $78 = ((($79)) + -12|0);
        __ZNSt3__26vectorIfNS_9allocatorIfEEED2Ev($78);
        $80 = ($78|0)==($19|0);
        if ($80) {
         break;
        } else {
         $79 = $78;
        }
       }
       (___cxa_atexit((45|0),(6756|0),(___dso_handle|0))|0);
       STACKTOP = sp;return;
      }
     }
    }
   }
  }
 }
 $81 = ___cxa_find_matching_catch_2()|0;
 $82 = tempRet0;
 $21 = $81;
 $22 = $82;
 $83 = $20;
 $84 = ($19|0)==($83|0);
 if ($84) {
  $91 = $21;
  $92 = $22;
  ___resumeException($91|0);
  // unreachable;
 } else {
  $86 = $83;
 }
 while(1) {
  $85 = ((($86)) + -12|0);
  __ZNSt3__26vectorIfNS_9allocatorIfEEED2Ev($85);
  $87 = ($85|0)==($19|0);
  if ($87) {
   break;
  } else {
   $86 = $85;
  }
 }
 $91 = $21;
 $92 = $22;
 ___resumeException($91|0);
 // unreachable;
}
function __Z10getTextureNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEE4Side($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$expand_i1_val = 0, $$expand_i1_val11 = 0, $$expand_i1_val13 = 0, $$expand_i1_val2 = 0, $$expand_i1_val5 = 0, $$expand_i1_val7 = 0, $$pre_trunc = 0, $$pre_trunc15 = 0, $$pre_trunc9 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0;
 var $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0;
 var $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0;
 var $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0;
 var $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0;
 var $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0;
 var $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0;
 var $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0;
 var $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0;
 var $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 208|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(208|0);
 $17 = sp + 194|0;
 $33 = sp + 193|0;
 $49 = sp + 192|0;
 $53 = $2;
 $50 = $1;
 $51 = 1644;
 $54 = $51;
 __THREW__ = 0;
 $55 = (invoke_ii(47,($54|0))|0);
 $56 = __THREW__; __THREW__ = 0;
 $57 = $56&1;
 if ($57) {
  $89 = ___cxa_find_matching_catch_3(0|0)|0;
  $90 = tempRet0;
  ___clang_call_terminate($89);
  // unreachable;
 }
 $52 = $55;
 $58 = $52;
 $59 = $50;
 $48 = $59;
 $60 = $48;
 $47 = $60;
 $61 = $47;
 $46 = $61;
 $62 = $46;
 $45 = $62;
 $63 = $45;
 $64 = ((($63)) + 11|0);
 $65 = HEAP8[$64>>0]|0;
 $66 = $65&255;
 $67 = $66 & 128;
 $68 = ($67|0)!=(0);
 if ($68) {
  $41 = $60;
  $69 = $41;
  $40 = $69;
  $70 = $40;
  $39 = $70;
  $71 = $39;
  $72 = ((($71)) + 4|0);
  $73 = HEAP32[$72>>2]|0;
  $81 = $73;
 } else {
  $44 = $60;
  $74 = $44;
  $43 = $74;
  $75 = $43;
  $42 = $75;
  $76 = $42;
  $77 = ((($76)) + 11|0);
  $78 = HEAP8[$77>>0]|0;
  $79 = $78&255;
  $81 = $79;
 }
 $80 = ($58|0)!=($81|0);
 do {
  if ($80) {
   $$expand_i1_val = 0;
   HEAP8[$49>>0] = $$expand_i1_val;
  } else {
   $82 = $50;
   $83 = $51;
   $84 = $52;
   __THREW__ = 0;
   $85 = (invoke_iiiiii(48,($82|0),0,-1,($83|0),($84|0))|0);
   $86 = __THREW__; __THREW__ = 0;
   $87 = $86&1;
   if ($87) {
    $89 = ___cxa_find_matching_catch_3(0|0)|0;
    $90 = tempRet0;
    ___clang_call_terminate($89);
    // unreachable;
   } else {
    $88 = ($85|0)==(0);
    $$expand_i1_val2 = $88&1;
    HEAP8[$49>>0] = $$expand_i1_val2;
    break;
   }
  }
 } while(0);
 $$pre_trunc = HEAP8[$49>>0]|0;
 $91 = $$pre_trunc&1;
 if ($91) {
  $92 = $53;
  $37 = 6732;
  $38 = $92;
  $93 = $37;
  $94 = HEAP32[$93>>2]|0;
  $95 = $38;
  $96 = (($94) + (($95*12)|0)|0);
  __ZNSt3__26vectorIfNS_9allocatorIfEEEC2ERKS3_($0,$96);
  STACKTOP = sp;return;
 }
 $34 = $1;
 $35 = 1650;
 $97 = $35;
 __THREW__ = 0;
 $98 = (invoke_ii(47,($97|0))|0);
 $99 = __THREW__; __THREW__ = 0;
 $100 = $99&1;
 if ($100) {
  $132 = ___cxa_find_matching_catch_3(0|0)|0;
  $133 = tempRet0;
  ___clang_call_terminate($132);
  // unreachable;
 }
 $36 = $98;
 $101 = $36;
 $102 = $34;
 $32 = $102;
 $103 = $32;
 $31 = $103;
 $104 = $31;
 $30 = $104;
 $105 = $30;
 $29 = $105;
 $106 = $29;
 $107 = ((($106)) + 11|0);
 $108 = HEAP8[$107>>0]|0;
 $109 = $108&255;
 $110 = $109 & 128;
 $111 = ($110|0)!=(0);
 if ($111) {
  $25 = $103;
  $112 = $25;
  $24 = $112;
  $113 = $24;
  $23 = $113;
  $114 = $23;
  $115 = ((($114)) + 4|0);
  $116 = HEAP32[$115>>2]|0;
  $124 = $116;
 } else {
  $28 = $103;
  $117 = $28;
  $27 = $117;
  $118 = $27;
  $26 = $118;
  $119 = $26;
  $120 = ((($119)) + 11|0);
  $121 = HEAP8[$120>>0]|0;
  $122 = $121&255;
  $124 = $122;
 }
 $123 = ($101|0)!=($124|0);
 do {
  if ($123) {
   $$expand_i1_val5 = 0;
   HEAP8[$33>>0] = $$expand_i1_val5;
  } else {
   $125 = $34;
   $126 = $35;
   $127 = $36;
   __THREW__ = 0;
   $128 = (invoke_iiiiii(48,($125|0),0,-1,($126|0),($127|0))|0);
   $129 = __THREW__; __THREW__ = 0;
   $130 = $129&1;
   if ($130) {
    $132 = ___cxa_find_matching_catch_3(0|0)|0;
    $133 = tempRet0;
    ___clang_call_terminate($132);
    // unreachable;
   } else {
    $131 = ($128|0)==(0);
    $$expand_i1_val7 = $131&1;
    HEAP8[$33>>0] = $$expand_i1_val7;
    break;
   }
  }
 } while(0);
 $$pre_trunc9 = HEAP8[$33>>0]|0;
 $134 = $$pre_trunc9&1;
 if ($134) {
  $135 = $53;
  $21 = 6756;
  $22 = $135;
  $136 = $21;
  $137 = HEAP32[$136>>2]|0;
  $138 = $22;
  $139 = (($137) + (($138*12)|0)|0);
  __ZNSt3__26vectorIfNS_9allocatorIfEEEC2ERKS3_($0,$139);
  STACKTOP = sp;return;
 }
 $18 = $1;
 $19 = 1655;
 $140 = $19;
 __THREW__ = 0;
 $141 = (invoke_ii(47,($140|0))|0);
 $142 = __THREW__; __THREW__ = 0;
 $143 = $142&1;
 if ($143) {
  $175 = ___cxa_find_matching_catch_3(0|0)|0;
  $176 = tempRet0;
  ___clang_call_terminate($175);
  // unreachable;
 }
 $20 = $141;
 $144 = $20;
 $145 = $18;
 $16 = $145;
 $146 = $16;
 $15 = $146;
 $147 = $15;
 $14 = $147;
 $148 = $14;
 $13 = $148;
 $149 = $13;
 $150 = ((($149)) + 11|0);
 $151 = HEAP8[$150>>0]|0;
 $152 = $151&255;
 $153 = $152 & 128;
 $154 = ($153|0)!=(0);
 if ($154) {
  $9 = $146;
  $155 = $9;
  $8 = $155;
  $156 = $8;
  $7 = $156;
  $157 = $7;
  $158 = ((($157)) + 4|0);
  $159 = HEAP32[$158>>2]|0;
  $167 = $159;
 } else {
  $12 = $146;
  $160 = $12;
  $11 = $160;
  $161 = $11;
  $10 = $161;
  $162 = $10;
  $163 = ((($162)) + 11|0);
  $164 = HEAP8[$163>>0]|0;
  $165 = $164&255;
  $167 = $165;
 }
 $166 = ($144|0)!=($167|0);
 do {
  if ($166) {
   $$expand_i1_val11 = 0;
   HEAP8[$17>>0] = $$expand_i1_val11;
  } else {
   $168 = $18;
   $169 = $19;
   $170 = $20;
   __THREW__ = 0;
   $171 = (invoke_iiiiii(48,($168|0),0,-1,($169|0),($170|0))|0);
   $172 = __THREW__; __THREW__ = 0;
   $173 = $172&1;
   if ($173) {
    $175 = ___cxa_find_matching_catch_3(0|0)|0;
    $176 = tempRet0;
    ___clang_call_terminate($175);
    // unreachable;
   } else {
    $174 = ($171|0)==(0);
    $$expand_i1_val13 = $174&1;
    HEAP8[$17>>0] = $$expand_i1_val13;
    break;
   }
  }
 } while(0);
 $$pre_trunc15 = HEAP8[$17>>0]|0;
 $177 = $$pre_trunc15&1;
 $178 = $53;
 if ($177) {
  $5 = 6744;
  $6 = $178;
  $179 = $5;
  $180 = HEAP32[$179>>2]|0;
  $181 = $6;
  $182 = (($180) + (($181*12)|0)|0);
  __ZNSt3__26vectorIfNS_9allocatorIfEEEC2ERKS3_($0,$182);
  STACKTOP = sp;return;
 } else {
  $3 = 6732;
  $4 = $178;
  $183 = $3;
  $184 = HEAP32[$183>>2]|0;
  $185 = $4;
  $186 = (($184) + (($185*12)|0)|0);
  __ZNSt3__26vectorIfNS_9allocatorIfEEEC2ERKS3_($0,$186);
  STACKTOP = sp;return;
 }
}
function ___cxx_global_var_init_19() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten3val6globalEPKc(1661)|0);
 HEAP32[1692] = $0;
 (___cxa_atexit((49|0),(6768|0),(___dso_handle|0))|0);
 return;
}
function __ZN10emscripten3val6globalEPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp + 4|0;
 $2 = $0;
 $3 = $2;
 $4 = (__emval_get_global(($3|0))|0);
 __ZN10emscripten3valC2EPNS_8internal7_EM_VALE($1,$4);
 $5 = HEAP32[$1>>2]|0;
 STACKTOP = sp;return ($5|0);
}
function __ZN10emscripten3valD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 __THREW__ = 0;
 invoke_vi(50,($3|0));
 $4 = __THREW__; __THREW__ = 0;
 $5 = $4&1;
 if ($5) {
  $6 = ___cxa_find_matching_catch_3(0|0)|0;
  $7 = tempRet0;
  ___clang_call_terminate($6);
  // unreachable;
 } else {
  STACKTOP = sp;return;
 }
}
function ___cxx_global_var_init_21() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten3val6globalEPKc(1667)|0);
 HEAP32[1693] = $0;
 (___cxa_atexit((49|0),(6772|0),(___dso_handle|0))|0);
 return;
}
function ___cxx_global_var_init_23() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten3val6globalEPKc(1680)|0);
 HEAP32[1694] = $0;
 (___cxa_atexit((49|0),(6776|0),(___dso_handle|0))|0);
 return;
}
function __Z12shouldRenderPPPbiii($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $8 = $4;
 $9 = $5;
 $10 = (Math_abs(($9|0))|0);
 $11 = (($10|0) % 20)&-1;
 $12 = (($8) + ($11<<2)|0);
 $13 = HEAP32[$12>>2]|0;
 $14 = $6;
 $15 = (Math_abs(($14|0))|0);
 $16 = (($15|0) % 20)&-1;
 $17 = (($13) + ($16<<2)|0);
 $18 = HEAP32[$17>>2]|0;
 $19 = $7;
 $20 = (Math_abs(($19|0))|0);
 $21 = (($20|0) % 20)&-1;
 $22 = (($18) + ($21)|0);
 $23 = HEAP8[$22>>0]|0;
 $24 = $23&1;
 $25 = $24 ^ 1;
 STACKTOP = sp;return ($25|0);
}
function __Z8chunkifyNSt3__26vectorI5BlockNS_9allocatorIS1_EEEE($0) {
 $0 = $0|0;
 var $$byval_copy = 0, $$byval_copy1 = 0, $$byval_copy2 = 0, $$byval_copy3 = 0, $$byval_copy4 = 0, $$byval_copy5 = 0, $$expand_i1_val = 0, $$expand_i1_val7 = 0, $$pre_trunc = 0, $1 = 0, $10 = 0, $100 = 0, $1000 = 0, $1001 = 0, $1002 = 0, $1003 = 0, $1004 = 0, $1005 = 0, $1006 = 0, $1007 = 0;
 var $1008 = 0, $1009 = 0, $101 = 0, $1010 = 0, $1011 = 0, $1012 = 0, $1013 = 0, $1014 = 0, $1015 = 0, $1016 = 0, $1017 = 0, $1018 = 0, $1019 = 0, $102 = 0, $1020 = 0, $1021 = 0, $1022 = 0, $1023 = 0, $1024 = 0, $1025 = 0;
 var $1026 = 0, $1027 = 0, $1028 = 0, $1029 = 0, $103 = 0, $1030 = 0, $1031 = 0, $1032 = 0, $1033 = 0, $1034 = 0, $1035 = 0, $1036 = 0, $1037 = 0, $1038 = 0, $1039 = 0, $104 = 0, $1040 = 0, $1041 = 0, $1042 = 0, $1043 = 0;
 var $1044 = 0, $1045 = 0, $1046 = 0, $1047 = 0, $1048 = 0, $1049 = 0, $105 = 0, $1050 = 0, $1051 = 0, $1052 = 0, $1053 = 0, $1054 = 0, $1055 = 0, $1056 = 0, $1057 = 0, $1058 = 0, $1059 = 0, $106 = 0, $1060 = 0, $1061 = 0;
 var $1062 = 0, $1063 = 0, $1064 = 0, $1065 = 0, $1066 = 0, $1067 = 0, $1068 = 0, $1069 = 0, $107 = 0, $1070 = 0, $1071 = 0, $1072 = 0, $1073 = 0, $1074 = 0, $1075 = 0, $1076 = 0, $1077 = 0, $1078 = 0, $1079 = 0, $108 = 0;
 var $1080 = 0, $1081 = 0, $1082 = 0, $1083 = 0, $1084 = 0, $1085 = 0, $1086 = 0, $1087 = 0, $1088 = 0, $1089 = 0, $109 = 0, $1090 = 0, $1091 = 0, $1092 = 0, $1093 = 0, $1094 = 0, $1095 = 0, $1096 = 0, $1097 = 0, $1098 = 0;
 var $1099 = 0, $11 = 0, $110 = 0, $1100 = 0, $1101 = 0, $1102 = 0, $1103 = 0, $1104 = 0, $1105 = 0, $1106 = 0, $1107 = 0, $1108 = 0, $1109 = 0, $111 = 0, $1110 = 0, $1111 = 0, $1112 = 0, $1113 = 0, $1114 = 0, $1115 = 0;
 var $1116 = 0, $1117 = 0, $1118 = 0, $1119 = 0, $112 = 0, $1120 = 0, $1121 = 0, $1122 = 0, $1123 = 0, $1124 = 0, $1125 = 0, $1126 = 0, $1127 = 0, $1128 = 0, $1129 = 0, $113 = 0, $1130 = 0, $1131 = 0, $1132 = 0, $1133 = 0;
 var $1134 = 0, $1135 = 0, $1136 = 0, $1137 = 0, $1138 = 0, $1139 = 0, $114 = 0, $1140 = 0, $1141 = 0, $1142 = 0, $1143 = 0, $1144 = 0, $1145 = 0, $1146 = 0, $1147 = 0, $1148 = 0, $1149 = 0, $115 = 0, $1150 = 0, $1151 = 0;
 var $1152 = 0, $1153 = 0, $1154 = 0, $1155 = 0, $1156 = 0, $1157 = 0, $1158 = 0, $1159 = 0, $116 = 0, $1160 = 0, $1161 = 0, $1162 = 0, $1163 = 0, $1164 = 0, $1165 = 0, $1166 = 0, $1167 = 0, $1168 = 0, $1169 = 0, $117 = 0;
 var $1170 = 0, $1171 = 0, $1172 = 0, $1173 = 0, $1174 = 0, $1175 = 0, $1176 = 0, $1177 = 0, $1178 = 0, $1179 = 0, $118 = 0, $1180 = 0, $1181 = 0, $1182 = 0, $1183 = 0, $1184 = 0, $1185 = 0, $1186 = 0, $1187 = 0, $1188 = 0;
 var $1189 = 0, $119 = 0, $1190 = 0, $1191 = 0, $1192 = 0, $1193 = 0, $1194 = 0, $1195 = 0, $1196 = 0, $1197 = 0, $1198 = 0, $1199 = 0, $12 = 0, $120 = 0, $1200 = 0, $1201 = 0, $1202 = 0, $1203 = 0, $1204 = 0, $1205 = 0;
 var $1206 = 0, $1207 = 0, $1208 = 0, $1209 = 0, $121 = 0, $1210 = 0, $1211 = 0, $1212 = 0, $1213 = 0, $1214 = 0, $1215 = 0, $1216 = 0, $1217 = 0, $1218 = 0, $1219 = 0, $122 = 0, $1220 = 0, $1221 = 0, $1222 = 0, $1223 = 0;
 var $1224 = 0, $1225 = 0, $1226 = 0, $1227 = 0, $1228 = 0, $1229 = 0, $123 = 0, $1230 = 0, $1231 = 0, $1232 = 0, $1233 = 0, $1234 = 0, $1235 = 0, $1236 = 0, $1237 = 0, $1238 = 0, $1239 = 0, $124 = 0, $1240 = 0, $1241 = 0;
 var $1242 = 0, $1243 = 0, $1244 = 0, $1245 = 0, $1246 = 0, $1247 = 0, $1248 = 0, $1249 = 0, $125 = 0, $1250 = 0, $1251 = 0, $1252 = 0, $1253 = 0, $1254 = 0, $1255 = 0, $1256 = 0, $1257 = 0, $1258 = 0, $1259 = 0, $126 = 0;
 var $1260 = 0, $1261 = 0, $1262 = 0, $1263 = 0, $1264 = 0, $1265 = 0, $1266 = 0, $1267 = 0, $1268 = 0, $1269 = 0, $127 = 0, $1270 = 0, $1271 = 0, $1272 = 0, $1273 = 0, $1274 = 0, $1275 = 0, $1276 = 0, $1277 = 0, $1278 = 0;
 var $1279 = 0, $128 = 0, $1280 = 0, $1281 = 0, $1282 = 0, $1283 = 0, $1284 = 0, $1285 = 0, $1286 = 0, $1287 = 0, $1288 = 0, $1289 = 0, $129 = 0, $1290 = 0, $1291 = 0, $1292 = 0, $1293 = 0, $1294 = 0, $1295 = 0, $1296 = 0;
 var $1297 = 0, $1298 = 0, $1299 = 0, $13 = 0, $130 = 0, $1300 = 0, $1301 = 0, $1302 = 0, $1303 = 0, $1304 = 0, $1305 = 0, $1306 = 0, $1307 = 0, $1308 = 0, $1309 = 0, $131 = 0, $1310 = 0, $1311 = 0, $1312 = 0, $1313 = 0;
 var $1314 = 0, $1315 = 0, $1316 = 0, $1317 = 0, $1318 = 0, $1319 = 0, $132 = 0, $1320 = 0, $1321 = 0, $1322 = 0, $1323 = 0, $1324 = 0, $1325 = 0, $1326 = 0, $1327 = 0, $1328 = 0, $1329 = 0, $133 = 0, $1330 = 0, $1331 = 0;
 var $1332 = 0, $1333 = 0, $1334 = 0, $1335 = 0, $1336 = 0, $1337 = 0, $1338 = 0, $1339 = 0, $134 = 0, $1340 = 0, $1341 = 0, $1342 = 0, $1343 = 0, $1344 = 0, $1345 = 0, $1346 = 0, $1347 = 0, $1348 = 0, $1349 = 0, $135 = 0;
 var $1350 = 0, $1351 = 0, $1352 = 0, $1353 = 0, $1354 = 0, $1355 = 0, $1356 = 0, $1357 = 0, $1358 = 0, $1359 = 0, $136 = 0, $1360 = 0, $1361 = 0, $1362 = 0, $1363 = 0, $1364 = 0, $1365 = 0, $1366 = 0, $1367 = 0, $1368 = 0;
 var $1369 = 0, $137 = 0, $1370 = 0, $1371 = 0, $1372 = 0, $1373 = 0, $1374 = 0, $1375 = 0, $1376 = 0, $1377 = 0, $1378 = 0, $1379 = 0, $138 = 0, $1380 = 0, $1381 = 0, $1382 = 0, $1383 = 0, $1384 = 0, $1385 = 0, $1386 = 0;
 var $1387 = 0, $1388 = 0, $1389 = 0, $139 = 0, $1390 = 0, $1391 = 0, $1392 = 0, $1393 = 0, $1394 = 0, $1395 = 0, $1396 = 0, $1397 = 0, $1398 = 0, $1399 = 0, $14 = 0, $140 = 0, $1400 = 0, $1401 = 0, $1402 = 0, $1403 = 0;
 var $1404 = 0, $1405 = 0, $1406 = 0, $1407 = 0, $1408 = 0, $1409 = 0, $141 = 0, $1410 = 0, $1411 = 0, $1412 = 0, $1413 = 0, $1414 = 0, $1415 = 0, $1416 = 0, $1417 = 0, $1418 = 0, $1419 = 0, $142 = 0, $1420 = 0, $1421 = 0;
 var $1422 = 0, $1423 = 0, $1424 = 0, $1425 = 0, $1426 = 0, $1427 = 0, $1428 = 0, $1429 = 0, $143 = 0, $1430 = 0, $1431 = 0, $1432 = 0, $1433 = 0, $1434 = 0, $1435 = 0, $1436 = 0, $1437 = 0, $1438 = 0, $1439 = 0, $144 = 0;
 var $1440 = 0, $1441 = 0, $1442 = 0, $1443 = 0, $1444 = 0, $1445 = 0, $1446 = 0, $1447 = 0, $1448 = 0, $1449 = 0, $145 = 0, $1450 = 0, $1451 = 0, $1452 = 0, $1453 = 0, $1454 = 0, $1455 = 0, $1456 = 0, $1457 = 0, $1458 = 0;
 var $1459 = 0, $146 = 0, $1460 = 0, $1461 = 0, $1462 = 0, $1463 = 0, $1464 = 0, $1465 = 0, $1466 = 0, $1467 = 0, $1468 = 0, $1469 = 0, $147 = 0, $1470 = 0, $1471 = 0, $1472 = 0, $1473 = 0, $1474 = 0, $1475 = 0, $1476 = 0;
 var $1477 = 0, $1478 = 0, $1479 = 0, $148 = 0, $1480 = 0, $1481 = 0, $1482 = 0, $1483 = 0, $1484 = 0, $1485 = 0, $1486 = 0, $1487 = 0, $1488 = 0, $1489 = 0, $149 = 0, $1490 = 0, $1491 = 0, $1492 = 0, $1493 = 0, $1494 = 0;
 var $1495 = 0, $1496 = 0, $1497 = 0, $1498 = 0, $1499 = 0, $15 = 0, $150 = 0, $1500 = 0, $1501 = 0, $1502 = 0, $1503 = 0, $1504 = 0, $1505 = 0, $1506 = 0, $1507 = 0, $1508 = 0, $1509 = 0, $151 = 0, $1510 = 0, $1511 = 0;
 var $1512 = 0, $1513 = 0, $1514 = 0, $1515 = 0, $1516 = 0, $1517 = 0, $1518 = 0, $1519 = 0, $152 = 0, $1520 = 0, $1521 = 0, $1522 = 0, $1523 = 0, $1524 = 0, $1525 = 0, $1526 = 0, $1527 = 0, $1528 = 0, $1529 = 0, $153 = 0;
 var $1530 = 0, $1531 = 0, $1532 = 0, $1533 = 0, $1534 = 0, $1535 = 0, $1536 = 0, $1537 = 0, $1538 = 0, $1539 = 0, $154 = 0, $1540 = 0, $1541 = 0, $1542 = 0, $1543 = 0, $1544 = 0, $1545 = 0, $1546 = 0, $1547 = 0, $1548 = 0;
 var $1549 = 0, $155 = 0, $1550 = 0, $1551 = 0, $1552 = 0, $1553 = 0, $1554 = 0, $1555 = 0, $1556 = 0, $1557 = 0, $1558 = 0, $1559 = 0, $156 = 0, $1560 = 0, $1561 = 0, $1562 = 0, $1563 = 0, $1564 = 0, $1565 = 0, $1566 = 0;
 var $1567 = 0, $1568 = 0, $1569 = 0, $157 = 0, $1570 = 0, $1571 = 0, $1572 = 0, $1573 = 0, $1574 = 0, $1575 = 0, $1576 = 0, $1577 = 0, $1578 = 0, $1579 = 0, $158 = 0, $1580 = 0, $1581 = 0, $1582 = 0, $1583 = 0, $1584 = 0;
 var $1585 = 0, $1586 = 0, $1587 = 0, $1588 = 0, $1589 = 0, $159 = 0, $1590 = 0, $1591 = 0, $1592 = 0, $1593 = 0, $1594 = 0, $1595 = 0, $1596 = 0, $1597 = 0, $1598 = 0, $1599 = 0, $16 = 0, $160 = 0, $1600 = 0, $1601 = 0;
 var $1602 = 0, $1603 = 0, $1604 = 0, $1605 = 0, $1606 = 0, $1607 = 0, $1608 = 0, $1609 = 0, $161 = 0, $1610 = 0, $1611 = 0, $1612 = 0, $1613 = 0, $1614 = 0, $1615 = 0, $1616 = 0, $1617 = 0, $1618 = 0, $1619 = 0, $162 = 0;
 var $1620 = 0, $1621 = 0, $1622 = 0, $1623 = 0, $1624 = 0, $1625 = 0, $1626 = 0, $1627 = 0, $1628 = 0, $1629 = 0, $163 = 0, $1630 = 0, $1631 = 0, $1632 = 0, $1633 = 0, $1634 = 0, $1635 = 0, $1636 = 0, $1637 = 0, $1638 = 0;
 var $1639 = 0, $164 = 0, $1640 = 0, $1641 = 0, $1642 = 0, $1643 = 0, $1644 = 0, $1645 = 0, $1646 = 0, $1647 = 0, $1648 = 0, $1649 = 0, $165 = 0, $1650 = 0, $1651 = 0, $1652 = 0, $1653 = 0, $1654 = 0, $1655 = 0, $1656 = 0;
 var $1657 = 0, $1658 = 0, $1659 = 0, $166 = 0, $1660 = 0, $1661 = 0, $1662 = 0, $1663 = 0, $1664 = 0, $1665 = 0, $1666 = 0, $1667 = 0, $1668 = 0, $1669 = 0, $167 = 0, $1670 = 0, $1671 = 0, $1672 = 0, $1673 = 0, $1674 = 0;
 var $1675 = 0, $1676 = 0, $1677 = 0, $1678 = 0, $1679 = 0, $168 = 0, $1680 = 0, $1681 = 0, $1682 = 0, $1683 = 0, $1684 = 0, $1685 = 0, $1686 = 0, $1687 = 0, $1688 = 0, $1689 = 0, $169 = 0, $1690 = 0, $1691 = 0, $1692 = 0;
 var $1693 = 0, $1694 = 0, $1695 = 0, $1696 = 0, $1697 = 0, $1698 = 0, $1699 = 0, $17 = 0, $170 = 0, $1700 = 0, $1701 = 0, $1702 = 0, $1703 = 0, $1704 = 0, $1705 = 0, $1706 = 0, $1707 = 0, $1708 = 0, $1709 = 0, $171 = 0;
 var $1710 = 0, $1711 = 0, $1712 = 0, $1713 = 0, $1714 = 0, $1715 = 0, $1716 = 0, $1717 = 0, $1718 = 0, $1719 = 0, $172 = 0, $1720 = 0, $1721 = 0, $1722 = 0, $1723 = 0, $1724 = 0, $1725 = 0, $1726 = 0, $1727 = 0, $1728 = 0;
 var $1729 = 0, $173 = 0, $1730 = 0, $1731 = 0, $1732 = 0, $1733 = 0, $1734 = 0, $1735 = 0, $1736 = 0, $1737 = 0, $1738 = 0, $1739 = 0, $174 = 0, $1740 = 0, $1741 = 0, $1742 = 0, $1743 = 0, $1744 = 0, $1745 = 0, $1746 = 0;
 var $1747 = 0, $1748 = 0, $1749 = 0, $175 = 0, $1750 = 0, $1751 = 0, $1752 = 0, $1753 = 0, $1754 = 0, $1755 = 0, $1756 = 0, $1757 = 0, $1758 = 0, $1759 = 0, $176 = 0, $1760 = 0, $1761 = 0, $1762 = 0, $1763 = 0, $1764 = 0;
 var $1765 = 0, $1766 = 0, $1767 = 0, $1768 = 0, $1769 = 0, $177 = 0, $1770 = 0, $1771 = 0, $1772 = 0, $1773 = 0, $1774 = 0, $1775 = 0, $1776 = 0, $1777 = 0, $1778 = 0, $1779 = 0, $178 = 0, $1780 = 0, $1781 = 0, $1782 = 0;
 var $1783 = 0, $1784 = 0, $1785 = 0, $1786 = 0, $1787 = 0, $1788 = 0, $1789 = 0, $179 = 0, $1790 = 0, $1791 = 0, $1792 = 0, $1793 = 0, $1794 = 0, $1795 = 0, $1796 = 0, $1797 = 0, $1798 = 0, $1799 = 0, $18 = 0, $180 = 0;
 var $1800 = 0, $1801 = 0, $1802 = 0, $1803 = 0, $1804 = 0, $1805 = 0, $1806 = 0, $1807 = 0, $1808 = 0, $1809 = 0, $181 = 0, $1810 = 0, $1811 = 0, $1812 = 0, $1813 = 0, $1814 = 0, $1815 = 0, $1816 = 0, $1817 = 0, $1818 = 0;
 var $1819 = 0, $182 = 0, $1820 = 0, $1821 = 0, $1822 = 0, $1823 = 0, $1824 = 0, $1825 = 0, $1826 = 0, $1827 = 0, $1828 = 0, $1829 = 0, $183 = 0, $1830 = 0, $1831 = 0, $1832 = 0, $1833 = 0, $1834 = 0, $1835 = 0, $1836 = 0;
 var $1837 = 0, $1838 = 0, $1839 = 0, $184 = 0, $1840 = 0, $1841 = 0, $1842 = 0, $1843 = 0, $1844 = 0, $1845 = 0, $1846 = 0, $1847 = 0, $1848 = 0, $1849 = 0, $185 = 0, $1850 = 0, $1851 = 0, $1852 = 0, $1853 = 0, $1854 = 0;
 var $1855 = 0, $1856 = 0, $1857 = 0, $1858 = 0, $1859 = 0, $186 = 0, $1860 = 0, $1861 = 0, $1862 = 0, $1863 = 0, $1864 = 0, $1865 = 0, $1866 = 0, $1867 = 0, $1868 = 0, $1869 = 0, $187 = 0, $1870 = 0, $1871 = 0, $1872 = 0;
 var $1873 = 0, $1874 = 0, $1875 = 0, $1876 = 0, $1877 = 0, $1878 = 0, $1879 = 0, $188 = 0, $1880 = 0, $1881 = 0, $1882 = 0, $1883 = 0, $1884 = 0, $1885 = 0, $1886 = 0, $1887 = 0, $1888 = 0, $1889 = 0, $189 = 0, $1890 = 0;
 var $1891 = 0, $1892 = 0, $1893 = 0, $1894 = 0, $1895 = 0, $1896 = 0, $1897 = 0, $1898 = 0, $1899 = 0, $19 = 0, $190 = 0, $1900 = 0, $1901 = 0, $1902 = 0, $1903 = 0, $1904 = 0, $1905 = 0, $1906 = 0, $1907 = 0, $1908 = 0;
 var $1909 = 0, $191 = 0, $1910 = 0, $1911 = 0, $1912 = 0, $1913 = 0, $1914 = 0, $1915 = 0, $1916 = 0, $1917 = 0, $1918 = 0, $1919 = 0, $192 = 0, $1920 = 0, $1921 = 0, $1922 = 0, $1923 = 0, $1924 = 0, $1925 = 0, $1926 = 0;
 var $1927 = 0, $1928 = 0, $1929 = 0, $193 = 0, $1930 = 0, $1931 = 0, $1932 = 0, $1933 = 0, $1934 = 0, $1935 = 0, $1936 = 0, $1937 = 0, $1938 = 0, $1939 = 0, $194 = 0, $1940 = 0, $1941 = 0, $1942 = 0, $1943 = 0, $1944 = 0;
 var $1945 = 0, $1946 = 0, $1947 = 0, $1948 = 0, $1949 = 0, $195 = 0, $1950 = 0, $1951 = 0, $1952 = 0, $1953 = 0, $1954 = 0, $1955 = 0, $1956 = 0, $1957 = 0, $1958 = 0, $1959 = 0, $196 = 0, $1960 = 0, $1961 = 0, $1962 = 0;
 var $1963 = 0, $1964 = 0, $1965 = 0, $1966 = 0, $1967 = 0, $1968 = 0, $1969 = 0, $197 = 0, $1970 = 0, $1971 = 0, $1972 = 0, $1973 = 0, $1974 = 0, $1975 = 0, $1976 = 0, $1977 = 0, $1978 = 0, $1979 = 0, $198 = 0, $1980 = 0;
 var $1981 = 0, $1982 = 0, $1983 = 0, $1984 = 0, $1985 = 0, $1986 = 0, $1987 = 0, $1988 = 0, $1989 = 0, $199 = 0, $1990 = 0, $1991 = 0, $1992 = 0, $1993 = 0, $1994 = 0, $1995 = 0, $1996 = 0, $1997 = 0, $1998 = 0, $1999 = 0;
 var $2 = 0, $20 = 0, $200 = 0, $2000 = 0, $2001 = 0, $2002 = 0, $2003 = 0, $2004 = 0, $2005 = 0, $2006 = 0, $2007 = 0, $2008 = 0, $2009 = 0, $201 = 0, $2010 = 0, $2011 = 0, $2012 = 0, $2013 = 0, $2014 = 0, $2015 = 0;
 var $2016 = 0, $2017 = 0, $2018 = 0, $2019 = 0, $202 = 0, $2020 = 0, $2021 = 0, $2022 = 0, $2023 = 0, $2024 = 0, $2025 = 0, $2026 = 0, $2027 = 0, $2028 = 0, $2029 = 0, $203 = 0, $2030 = 0, $2031 = 0, $2032 = 0, $2033 = 0;
 var $2034 = 0, $2035 = 0, $2036 = 0, $2037 = 0, $2038 = 0, $2039 = 0, $204 = 0, $2040 = 0, $2041 = 0, $2042 = 0, $2043 = 0, $2044 = 0, $2045 = 0, $2046 = 0, $2047 = 0, $2048 = 0, $2049 = 0, $205 = 0, $2050 = 0, $2051 = 0;
 var $2052 = 0, $2053 = 0, $2054 = 0, $2055 = 0, $2056 = 0, $2057 = 0, $2058 = 0, $2059 = 0, $206 = 0, $2060 = 0, $2061 = 0, $2062 = 0, $2063 = 0, $2064 = 0, $2065 = 0, $2066 = 0, $2067 = 0, $2068 = 0, $2069 = 0, $207 = 0;
 var $2070 = 0, $2071 = 0, $2072 = 0, $2073 = 0, $2074 = 0, $2075 = 0, $2076 = 0, $2077 = 0, $2078 = 0, $2079 = 0, $208 = 0, $2080 = 0, $2081 = 0, $2082 = 0, $2083 = 0, $2084 = 0, $2085 = 0, $2086 = 0, $2087 = 0, $2088 = 0;
 var $2089 = 0, $209 = 0, $2090 = 0, $2091 = 0, $2092 = 0, $2093 = 0, $2094 = 0, $2095 = 0, $2096 = 0, $2097 = 0, $2098 = 0, $2099 = 0, $21 = 0, $210 = 0, $2100 = 0, $2101 = 0, $2102 = 0, $2103 = 0, $2104 = 0, $2105 = 0;
 var $2106 = 0, $2107 = 0, $2108 = 0, $2109 = 0, $211 = 0, $2110 = 0, $2111 = 0, $2112 = 0, $2113 = 0, $2114 = 0, $2115 = 0, $2116 = 0, $2117 = 0, $2118 = 0, $2119 = 0, $212 = 0, $2120 = 0, $2121 = 0, $2122 = 0, $2123 = 0;
 var $2124 = 0, $2125 = 0, $2126 = 0, $2127 = 0, $2128 = 0, $2129 = 0, $213 = 0, $2130 = 0, $2131 = 0, $2132 = 0, $2133 = 0, $2134 = 0, $2135 = 0, $2136 = 0, $2137 = 0, $2138 = 0, $2139 = 0, $214 = 0, $2140 = 0, $2141 = 0;
 var $2142 = 0, $2143 = 0, $2144 = 0, $2145 = 0, $2146 = 0, $2147 = 0, $2148 = 0, $2149 = 0, $215 = 0, $2150 = 0, $2151 = 0, $2152 = 0, $2153 = 0, $2154 = 0, $2155 = 0, $2156 = 0, $2157 = 0, $2158 = 0, $2159 = 0, $216 = 0;
 var $2160 = 0, $2161 = 0, $2162 = 0, $2163 = 0, $2164 = 0, $2165 = 0, $2166 = 0, $2167 = 0, $2168 = 0, $2169 = 0, $217 = 0, $2170 = 0, $2171 = 0, $2172 = 0, $2173 = 0, $2174 = 0, $2175 = 0, $2176 = 0, $2177 = 0, $2178 = 0;
 var $2179 = 0, $218 = 0, $2180 = 0, $2181 = 0, $2182 = 0, $2183 = 0, $2184 = 0, $2185 = 0, $2186 = 0, $2187 = 0, $2188 = 0, $2189 = 0, $219 = 0, $2190 = 0, $2191 = 0, $2192 = 0, $2193 = 0, $2194 = 0, $2195 = 0, $2196 = 0;
 var $2197 = 0, $2198 = 0, $2199 = 0, $22 = 0, $220 = 0, $2200 = 0, $2201 = 0, $2202 = 0, $2203 = 0, $2204 = 0, $2205 = 0, $2206 = 0, $2207 = 0, $2208 = 0, $2209 = 0, $221 = 0, $2210 = 0, $2211 = 0, $2212 = 0, $2213 = 0;
 var $2214 = 0, $2215 = 0, $2216 = 0, $2217 = 0, $2218 = 0, $2219 = 0, $222 = 0, $2220 = 0, $2221 = 0, $2222 = 0, $2223 = 0, $2224 = 0, $2225 = 0, $2226 = 0, $2227 = 0, $2228 = 0, $2229 = 0, $223 = 0, $2230 = 0, $2231 = 0;
 var $2232 = 0, $2233 = 0, $2234 = 0, $2235 = 0, $2236 = 0, $2237 = 0, $2238 = 0, $2239 = 0, $224 = 0, $2240 = 0, $2241 = 0, $2242 = 0, $2243 = 0, $2244 = 0, $2245 = 0, $2246 = 0, $2247 = 0, $2248 = 0, $2249 = 0, $225 = 0;
 var $2250 = 0, $2251 = 0, $2252 = 0, $2253 = 0, $2254 = 0, $2255 = 0, $2256 = 0, $2257 = 0, $2258 = 0, $2259 = 0, $226 = 0, $2260 = 0, $2261 = 0, $2262 = 0, $2263 = 0, $2264 = 0, $2265 = 0, $2266 = 0, $2267 = 0, $2268 = 0;
 var $2269 = 0, $227 = 0, $2270 = 0, $2271 = 0, $2272 = 0, $2273 = 0, $2274 = 0, $2275 = 0, $2276 = 0, $2277 = 0, $2278 = 0, $2279 = 0, $228 = 0, $2280 = 0, $2281 = 0, $2282 = 0, $2283 = 0, $2284 = 0, $2285 = 0, $2286 = 0;
 var $2287 = 0, $2288 = 0, $2289 = 0, $229 = 0, $2290 = 0, $2291 = 0, $2292 = 0, $2293 = 0, $2294 = 0, $2295 = 0, $2296 = 0, $2297 = 0, $2298 = 0, $2299 = 0, $23 = 0, $230 = 0, $2300 = 0, $2301 = 0, $2302 = 0, $2303 = 0;
 var $2304 = 0, $2305 = 0, $2306 = 0, $2307 = 0, $2308 = 0, $2309 = 0, $231 = 0, $2310 = 0, $2311 = 0, $2312 = 0, $2313 = 0, $2314 = 0, $2315 = 0, $2316 = 0, $2317 = 0, $2318 = 0, $2319 = 0, $232 = 0, $2320 = 0, $2321 = 0;
 var $2322 = 0, $2323 = 0, $2324 = 0, $2325 = 0, $2326 = 0, $2327 = 0, $2328 = 0, $2329 = 0, $233 = 0, $2330 = 0, $2331 = 0, $2332 = 0, $2333 = 0, $2334 = 0, $2335 = 0, $2336 = 0, $2337 = 0, $2338 = 0, $2339 = 0, $234 = 0;
 var $2340 = 0, $2341 = 0, $2342 = 0, $2343 = 0, $2344 = 0, $2345 = 0, $2346 = 0, $2347 = 0, $2348 = 0, $2349 = 0, $235 = 0, $2350 = 0, $2351 = 0, $2352 = 0, $2353 = 0, $2354 = 0, $2355 = 0, $2356 = 0, $2357 = 0, $2358 = 0;
 var $2359 = 0, $236 = 0, $2360 = 0, $2361 = 0, $2362 = 0, $2363 = 0, $2364 = 0, $2365 = 0, $2366 = 0, $2367 = 0, $2368 = 0, $2369 = 0, $237 = 0, $2370 = 0, $2371 = 0, $2372 = 0, $2373 = 0, $2374 = 0, $2375 = 0, $2376 = 0;
 var $2377 = 0, $2378 = 0, $2379 = 0, $238 = 0, $2380 = 0, $2381 = 0, $2382 = 0, $2383 = 0, $2384 = 0, $2385 = 0, $2386 = 0, $2387 = 0, $2388 = 0, $2389 = 0, $239 = 0, $2390 = 0, $2391 = 0, $2392 = 0, $2393 = 0, $2394 = 0;
 var $2395 = 0, $2396 = 0, $2397 = 0, $2398 = 0, $2399 = 0, $24 = 0, $240 = 0, $2400 = 0, $2401 = 0, $2402 = 0, $2403 = 0, $2404 = 0, $2405 = 0, $2406 = 0, $2407 = 0, $2408 = 0, $2409 = 0, $241 = 0, $2410 = 0, $2411 = 0;
 var $2412 = 0, $2413 = 0, $2414 = 0, $2415 = 0, $2416 = 0, $2417 = 0, $2418 = 0, $2419 = 0, $242 = 0, $2420 = 0, $2421 = 0, $2422 = 0, $2423 = 0, $2424 = 0, $2425 = 0, $2426 = 0, $2427 = 0, $2428 = 0, $2429 = 0, $243 = 0;
 var $2430 = 0, $2431 = 0, $2432 = 0, $2433 = 0, $2434 = 0, $2435 = 0, $2436 = 0, $2437 = 0, $2438 = 0, $2439 = 0, $244 = 0, $2440 = 0, $2441 = 0, $2442 = 0, $2443 = 0, $2444 = 0, $2445 = 0, $2446 = 0, $2447 = 0, $2448 = 0;
 var $2449 = 0, $245 = 0, $2450 = 0, $2451 = 0, $2452 = 0, $2453 = 0, $2454 = 0, $2455 = 0, $2456 = 0, $2457 = 0, $2458 = 0, $2459 = 0, $246 = 0, $2460 = 0, $2461 = 0, $2462 = 0, $2463 = 0, $2464 = 0, $2465 = 0, $2466 = 0;
 var $2467 = 0, $2468 = 0, $2469 = 0, $247 = 0, $2470 = 0, $2471 = 0, $2472 = 0, $2473 = 0, $2474 = 0, $2475 = 0, $2476 = 0, $2477 = 0, $2478 = 0, $2479 = 0, $248 = 0, $2480 = 0, $2481 = 0, $2482 = 0, $2483 = 0, $2484 = 0;
 var $2485 = 0, $2486 = 0, $2487 = 0, $2488 = 0, $2489 = 0, $249 = 0, $2490 = 0, $2491 = 0, $2492 = 0, $2493 = 0, $2494 = 0, $2495 = 0, $2496 = 0, $2497 = 0, $2498 = 0, $2499 = 0, $25 = 0, $250 = 0, $2500 = 0, $2501 = 0;
 var $2502 = 0, $2503 = 0, $2504 = 0, $2505 = 0, $2506 = 0, $2507 = 0, $2508 = 0, $2509 = 0, $251 = 0, $2510 = 0, $2511 = 0, $2512 = 0, $2513 = 0, $2514 = 0, $2515 = 0, $2516 = 0, $2517 = 0, $2518 = 0, $2519 = 0, $252 = 0;
 var $2520 = 0, $2521 = 0, $2522 = 0, $2523 = 0, $2524 = 0, $2525 = 0, $2526 = 0, $2527 = 0, $2528 = 0, $2529 = 0, $253 = 0, $2530 = 0, $2531 = 0, $2532 = 0, $2533 = 0, $2534 = 0, $2535 = 0, $2536 = 0, $2537 = 0, $2538 = 0;
 var $2539 = 0, $254 = 0, $2540 = 0, $2541 = 0, $2542 = 0, $2543 = 0, $2544 = 0, $2545 = 0, $2546 = 0, $2547 = 0, $2548 = 0, $2549 = 0, $255 = 0, $2550 = 0, $2551 = 0, $2552 = 0, $2553 = 0, $2554 = 0, $2555 = 0, $2556 = 0;
 var $2557 = 0, $2558 = 0, $2559 = 0, $256 = 0, $2560 = 0, $2561 = 0, $2562 = 0, $2563 = 0, $2564 = 0, $2565 = 0, $2566 = 0, $2567 = 0, $2568 = 0, $2569 = 0, $257 = 0, $2570 = 0, $2571 = 0, $2572 = 0, $2573 = 0, $2574 = 0;
 var $2575 = 0, $2576 = 0, $2577 = 0, $2578 = 0, $2579 = 0, $258 = 0, $2580 = 0, $2581 = 0, $2582 = 0, $2583 = 0, $2584 = 0, $2585 = 0, $2586 = 0, $2587 = 0, $2588 = 0, $2589 = 0, $259 = 0, $2590 = 0, $2591 = 0, $2592 = 0;
 var $2593 = 0, $2594 = 0, $2595 = 0, $2596 = 0, $2597 = 0, $2598 = 0, $2599 = 0, $26 = 0, $260 = 0, $2600 = 0, $2601 = 0, $2602 = 0, $2603 = 0, $2604 = 0, $2605 = 0, $2606 = 0, $2607 = 0, $2608 = 0, $2609 = 0, $261 = 0;
 var $2610 = 0, $2611 = 0, $2612 = 0, $2613 = 0, $2614 = 0, $2615 = 0, $2616 = 0, $2617 = 0, $2618 = 0, $2619 = 0, $262 = 0, $2620 = 0, $2621 = 0, $2622 = 0, $2623 = 0, $2624 = 0, $2625 = 0, $2626 = 0, $2627 = 0, $2628 = 0;
 var $2629 = 0, $263 = 0, $2630 = 0, $2631 = 0, $2632 = 0, $2633 = 0, $2634 = 0, $2635 = 0, $2636 = 0, $2637 = 0, $2638 = 0, $2639 = 0, $264 = 0, $2640 = 0, $2641 = 0, $2642 = 0, $2643 = 0, $2644 = 0, $2645 = 0, $2646 = 0;
 var $2647 = 0, $2648 = 0, $2649 = 0, $265 = 0, $2650 = 0, $2651 = 0, $2652 = 0, $2653 = 0, $2654 = 0, $2655 = 0, $2656 = 0, $2657 = 0, $2658 = 0, $2659 = 0, $266 = 0, $2660 = 0, $2661 = 0, $2662 = 0, $2663 = 0, $2664 = 0;
 var $2665 = 0, $2666 = 0, $2667 = 0, $2668 = 0, $2669 = 0, $267 = 0, $2670 = 0, $2671 = 0, $2672 = 0, $2673 = 0, $2674 = 0, $2675 = 0, $2676 = 0, $2677 = 0, $2678 = 0, $2679 = 0, $268 = 0, $2680 = 0, $2681 = 0, $2682 = 0;
 var $2683 = 0, $2684 = 0, $2685 = 0, $2686 = 0, $2687 = 0, $2688 = 0, $2689 = 0, $269 = 0, $2690 = 0, $2691 = 0, $2692 = 0, $2693 = 0, $2694 = 0, $2695 = 0, $2696 = 0, $2697 = 0, $2698 = 0, $2699 = 0, $27 = 0, $270 = 0;
 var $2700 = 0, $2701 = 0, $2702 = 0, $2703 = 0, $2704 = 0, $2705 = 0, $2706 = 0, $2707 = 0, $2708 = 0, $2709 = 0, $271 = 0, $2710 = 0, $2711 = 0, $2712 = 0, $2713 = 0, $2714 = 0, $2715 = 0, $2716 = 0, $2717 = 0, $2718 = 0;
 var $2719 = 0, $272 = 0, $2720 = 0, $2721 = 0, $2722 = 0, $2723 = 0, $2724 = 0, $2725 = 0, $2726 = 0, $2727 = 0, $2728 = 0, $2729 = 0, $273 = 0, $2730 = 0, $2731 = 0, $2732 = 0, $2733 = 0, $2734 = 0, $2735 = 0, $2736 = 0;
 var $2737 = 0, $2738 = 0, $2739 = 0, $274 = 0, $2740 = 0, $2741 = 0, $2742 = 0, $2743 = 0, $2744 = 0, $2745 = 0, $2746 = 0, $2747 = 0, $2748 = 0, $2749 = 0, $275 = 0, $2750 = 0, $2751 = 0, $2752 = 0, $2753 = 0, $2754 = 0;
 var $2755 = 0, $2756 = 0, $2757 = 0, $2758 = 0, $2759 = 0, $276 = 0, $2760 = 0, $2761 = 0, $2762 = 0, $2763 = 0, $2764 = 0, $2765 = 0, $2766 = 0, $2767 = 0, $2768 = 0, $2769 = 0, $277 = 0, $2770 = 0, $2771 = 0, $2772 = 0;
 var $2773 = 0, $2774 = 0, $2775 = 0, $2776 = 0, $2777 = 0, $2778 = 0, $2779 = 0, $278 = 0, $2780 = 0, $2781 = 0, $2782 = 0, $2783 = 0, $2784 = 0, $2785 = 0, $2786 = 0, $2787 = 0, $2788 = 0, $2789 = 0, $279 = 0, $2790 = 0;
 var $2791 = 0, $2792 = 0, $2793 = 0, $2794 = 0, $2795 = 0, $2796 = 0, $2797 = 0, $2798 = 0, $2799 = 0, $28 = 0, $280 = 0, $2800 = 0, $2801 = 0, $2802 = 0, $2803 = 0, $2804 = 0, $2805 = 0, $2806 = 0, $2807 = 0, $2808 = 0;
 var $2809 = 0, $281 = 0, $2810 = 0, $2811 = 0, $2812 = 0, $2813 = 0, $2814 = 0, $2815 = 0, $2816 = 0, $2817 = 0, $2818 = 0, $2819 = 0, $282 = 0, $2820 = 0, $2821 = 0, $2822 = 0, $2823 = 0, $2824 = 0, $2825 = 0, $2826 = 0;
 var $2827 = 0, $2828 = 0, $2829 = 0, $283 = 0, $2830 = 0, $2831 = 0, $2832 = 0, $2833 = 0, $2834 = 0, $2835 = 0, $2836 = 0, $2837 = 0, $2838 = 0, $2839 = 0, $284 = 0, $2840 = 0, $2841 = 0, $2842 = 0, $2843 = 0, $2844 = 0;
 var $2845 = 0, $2846 = 0, $2847 = 0, $2848 = 0, $2849 = 0, $285 = 0, $2850 = 0, $2851 = 0.0, $2852 = 0, $2853 = 0, $2854 = 0, $2855 = 0, $2856 = 0, $2857 = 0, $2858 = 0, $2859 = 0, $286 = 0, $2860 = 0, $2861 = 0, $2862 = 0;
 var $2863 = 0, $2864 = 0, $2865 = 0, $2866 = 0, $2867 = 0, $2868 = 0, $2869 = 0, $287 = 0, $2870 = 0, $2871 = 0, $2872 = 0, $2873 = 0, $2874 = 0, $2875 = 0, $2876 = 0, $2877 = 0, $2878 = 0, $2879 = 0, $288 = 0, $2880 = 0;
 var $2881 = 0, $2882 = 0, $2883 = 0, $2884 = 0, $2885 = 0, $2886 = 0, $2887 = 0, $2888 = 0, $2889 = 0, $289 = 0, $2890 = 0, $2891 = 0, $2892 = 0, $2893 = 0, $2894 = 0, $2895 = 0, $2896 = 0, $2897 = 0, $2898 = 0, $2899 = 0;
 var $29 = 0, $290 = 0, $2900 = 0, $2901 = 0, $2902 = 0, $2903 = 0, $2904 = 0, $2905 = 0, $2906 = 0, $2907 = 0, $2908 = 0, $2909 = 0, $291 = 0, $2910 = 0, $2911 = 0, $2912 = 0, $2913 = 0, $2914 = 0, $2915 = 0, $2916 = 0;
 var $2917 = 0, $2918 = 0, $2919 = 0, $292 = 0, $2920 = 0, $2921 = 0, $2922 = 0, $2923 = 0, $2924 = 0, $2925 = 0, $2926 = 0, $2927 = 0, $2928 = 0, $2929 = 0, $293 = 0, $2930 = 0, $2931 = 0, $2932 = 0, $2933 = 0, $2934 = 0;
 var $2935 = 0, $2936 = 0, $2937 = 0, $2938 = 0, $2939 = 0, $294 = 0, $2940 = 0, $2941 = 0, $2942 = 0, $2943 = 0, $2944 = 0, $2945 = 0, $2946 = 0, $2947 = 0, $2948 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0;
 var $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0;
 var $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0;
 var $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0;
 var $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0;
 var $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0;
 var $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0;
 var $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0;
 var $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0;
 var $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0;
 var $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0;
 var $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0, $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0;
 var $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0;
 var $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0;
 var $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0;
 var $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0, $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0;
 var $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0, $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0;
 var $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0, $599 = 0, $6 = 0, $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0;
 var $605 = 0, $606 = 0, $607 = 0, $608 = 0, $609 = 0, $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0, $616 = 0, $617 = 0, $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0;
 var $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0, $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0, $634 = 0, $635 = 0, $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0;
 var $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0, $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0, $652 = 0, $653 = 0, $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0;
 var $66 = 0, $660 = 0, $661 = 0, $662 = 0, $663 = 0, $664 = 0, $665 = 0, $666 = 0, $667 = 0, $668 = 0, $669 = 0, $67 = 0, $670 = 0, $671 = 0, $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0;
 var $678 = 0, $679 = 0, $68 = 0, $680 = 0, $681 = 0, $682 = 0, $683 = 0, $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0, $689 = 0, $69 = 0, $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0;
 var $696 = 0, $697 = 0, $698 = 0, $699 = 0, $7 = 0, $70 = 0, $700 = 0, $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0, $706 = 0, $707 = 0, $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0;
 var $713 = 0, $714 = 0, $715 = 0, $716 = 0, $717 = 0, $718 = 0, $719 = 0, $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0, $724 = 0, $725 = 0, $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0, $730 = 0;
 var $731 = 0, $732 = 0, $733 = 0, $734 = 0, $735 = 0, $736 = 0, $737 = 0, $738 = 0, $739 = 0, $74 = 0, $740 = 0, $741 = 0, $742 = 0, $743 = 0, $744 = 0, $745 = 0, $746 = 0, $747 = 0, $748 = 0, $749 = 0;
 var $75 = 0, $750 = 0, $751 = 0, $752 = 0, $753 = 0, $754 = 0, $755 = 0, $756 = 0, $757 = 0, $758 = 0, $759 = 0, $76 = 0, $760 = 0, $761 = 0, $762 = 0, $763 = 0, $764 = 0, $765 = 0, $766 = 0, $767 = 0;
 var $768 = 0, $769 = 0, $77 = 0, $770 = 0, $771 = 0, $772 = 0, $773 = 0, $774 = 0, $775 = 0, $776 = 0, $777 = 0, $778 = 0, $779 = 0, $78 = 0, $780 = 0, $781 = 0, $782 = 0, $783 = 0, $784 = 0, $785 = 0;
 var $786 = 0, $787 = 0, $788 = 0, $789 = 0, $79 = 0, $790 = 0, $791 = 0, $792 = 0, $793 = 0, $794 = 0, $795 = 0, $796 = 0, $797 = 0, $798 = 0, $799 = 0, $8 = 0, $80 = 0, $800 = 0, $801 = 0, $802 = 0;
 var $803 = 0, $804 = 0, $805 = 0, $806 = 0, $807 = 0, $808 = 0, $809 = 0, $81 = 0, $810 = 0, $811 = 0, $812 = 0, $813 = 0, $814 = 0, $815 = 0, $816 = 0, $817 = 0, $818 = 0, $819 = 0, $82 = 0, $820 = 0;
 var $821 = 0, $822 = 0, $823 = 0, $824 = 0, $825 = 0, $826 = 0, $827 = 0, $828 = 0, $829 = 0, $83 = 0, $830 = 0, $831 = 0, $832 = 0, $833 = 0, $834 = 0, $835 = 0, $836 = 0, $837 = 0, $838 = 0, $839 = 0;
 var $84 = 0, $840 = 0, $841 = 0, $842 = 0, $843 = 0, $844 = 0, $845 = 0, $846 = 0, $847 = 0, $848 = 0, $849 = 0, $85 = 0, $850 = 0, $851 = 0, $852 = 0, $853 = 0, $854 = 0, $855 = 0, $856 = 0, $857 = 0;
 var $858 = 0, $859 = 0, $86 = 0, $860 = 0, $861 = 0, $862 = 0, $863 = 0, $864 = 0, $865 = 0, $866 = 0, $867 = 0, $868 = 0, $869 = 0, $87 = 0, $870 = 0, $871 = 0, $872 = 0, $873 = 0, $874 = 0, $875 = 0;
 var $876 = 0, $877 = 0, $878 = 0, $879 = 0, $88 = 0, $880 = 0, $881 = 0, $882 = 0, $883 = 0, $884 = 0, $885 = 0, $886 = 0, $887 = 0, $888 = 0, $889 = 0, $89 = 0, $890 = 0, $891 = 0, $892 = 0, $893 = 0;
 var $894 = 0, $895 = 0, $896 = 0, $897 = 0, $898 = 0, $899 = 0, $9 = 0, $90 = 0, $900 = 0, $901 = 0, $902 = 0, $903 = 0, $904 = 0, $905 = 0, $906 = 0, $907 = 0, $908 = 0, $909 = 0, $91 = 0, $910 = 0;
 var $911 = 0, $912 = 0, $913 = 0, $914 = 0, $915 = 0, $916 = 0, $917 = 0, $918 = 0, $919 = 0, $92 = 0, $920 = 0, $921 = 0, $922 = 0, $923 = 0, $924 = 0, $925 = 0, $926 = 0, $927 = 0, $928 = 0, $929 = 0;
 var $93 = 0, $930 = 0, $931 = 0, $932 = 0, $933 = 0, $934 = 0, $935 = 0, $936 = 0, $937 = 0, $938 = 0, $939 = 0, $94 = 0, $940 = 0, $941 = 0, $942 = 0, $943 = 0, $944 = 0, $945 = 0, $946 = 0, $947 = 0;
 var $948 = 0, $949 = 0, $95 = 0, $950 = 0, $951 = 0, $952 = 0, $953 = 0, $954 = 0, $955 = 0, $956 = 0, $957 = 0, $958 = 0, $959 = 0, $96 = 0, $960 = 0, $961 = 0, $962 = 0, $963 = 0, $964 = 0, $965 = 0;
 var $966 = 0, $967 = 0, $968 = 0, $969 = 0, $97 = 0, $970 = 0, $971 = 0, $972 = 0, $973 = 0, $974 = 0, $975 = 0, $976 = 0, $977 = 0, $978 = 0, $979 = 0, $98 = 0, $980 = 0, $981 = 0, $982 = 0, $983 = 0;
 var $984 = 0, $985 = 0, $986 = 0, $987 = 0, $988 = 0, $989 = 0, $99 = 0, $990 = 0, $991 = 0, $992 = 0, $993 = 0, $994 = 0, $995 = 0, $996 = 0, $997 = 0, $998 = 0, $999 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 4864|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(4864|0);
 $$byval_copy5 = sp + 4784|0;
 $$byval_copy4 = sp + 4772|0;
 $$byval_copy3 = sp + 4760|0;
 $$byval_copy2 = sp + 4748|0;
 $$byval_copy1 = sp + 4736|0;
 $$byval_copy = sp + 4724|0;
 $11 = sp + 4680|0;
 $14 = sp + 4668|0;
 $18 = sp + 4652|0;
 $21 = sp + 4640|0;
 $35 = sp + 4584|0;
 $38 = sp + 4572|0;
 $42 = sp + 4556|0;
 $45 = sp + 4544|0;
 $59 = sp + 4488|0;
 $62 = sp + 4476|0;
 $66 = sp + 4460|0;
 $69 = sp + 4448|0;
 $81 = sp + 4400|0;
 $82 = sp + 376|0;
 $85 = sp + 4388|0;
 $86 = sp + 4862|0;
 $87 = sp + 368|0;
 $91 = sp + 4861|0;
 $115 = sp + 360|0;
 $120 = sp + 4860|0;
 $131 = sp + 4859|0;
 $140 = sp + 352|0;
 $145 = sp + 4858|0;
 $155 = sp + 4857|0;
 $163 = sp + 4112|0;
 $164 = sp + 344|0;
 $167 = sp + 4100|0;
 $168 = sp + 4856|0;
 $169 = sp + 336|0;
 $173 = sp + 4855|0;
 $197 = sp + 328|0;
 $202 = sp + 4854|0;
 $213 = sp + 4853|0;
 $219 = sp + 3916|0;
 $220 = sp + 320|0;
 $223 = sp + 3904|0;
 $224 = sp + 4852|0;
 $225 = sp + 312|0;
 $229 = sp + 4851|0;
 $253 = sp + 304|0;
 $258 = sp + 4850|0;
 $269 = sp + 4849|0;
 $278 = sp + 296|0;
 $283 = sp + 4848|0;
 $293 = sp + 4847|0;
 $301 = sp + 3628|0;
 $302 = sp + 288|0;
 $305 = sp + 3616|0;
 $306 = sp + 4846|0;
 $307 = sp + 280|0;
 $311 = sp + 4845|0;
 $335 = sp + 272|0;
 $340 = sp + 4844|0;
 $351 = sp + 4843|0;
 $357 = sp + 3432|0;
 $358 = sp + 264|0;
 $361 = sp + 3420|0;
 $362 = sp + 4842|0;
 $363 = sp + 256|0;
 $367 = sp + 4841|0;
 $391 = sp + 248|0;
 $396 = sp + 4840|0;
 $407 = sp + 4839|0;
 $416 = sp + 240|0;
 $421 = sp + 4838|0;
 $431 = sp + 4837|0;
 $439 = sp + 3144|0;
 $440 = sp + 232|0;
 $443 = sp + 3132|0;
 $444 = sp + 4836|0;
 $445 = sp + 224|0;
 $449 = sp + 4835|0;
 $473 = sp + 216|0;
 $478 = sp + 4834|0;
 $489 = sp + 4833|0;
 $495 = sp + 2948|0;
 $496 = sp + 208|0;
 $499 = sp + 2936|0;
 $500 = sp + 4832|0;
 $501 = sp + 200|0;
 $505 = sp + 4831|0;
 $529 = sp + 192|0;
 $534 = sp + 4830|0;
 $545 = sp + 4829|0;
 $554 = sp + 184|0;
 $559 = sp + 4828|0;
 $569 = sp + 4827|0;
 $577 = sp + 2660|0;
 $578 = sp + 176|0;
 $581 = sp + 2648|0;
 $582 = sp + 4826|0;
 $583 = sp + 168|0;
 $587 = sp + 4825|0;
 $611 = sp + 160|0;
 $616 = sp + 4824|0;
 $627 = sp + 4823|0;
 $633 = sp + 2464|0;
 $634 = sp + 152|0;
 $637 = sp + 2452|0;
 $638 = sp + 4822|0;
 $639 = sp + 144|0;
 $643 = sp + 4821|0;
 $667 = sp + 136|0;
 $672 = sp + 4820|0;
 $683 = sp + 4819|0;
 $692 = sp + 128|0;
 $697 = sp + 4818|0;
 $707 = sp + 4817|0;
 $715 = sp + 2176|0;
 $716 = sp + 120|0;
 $719 = sp + 2164|0;
 $720 = sp + 4816|0;
 $721 = sp + 112|0;
 $725 = sp + 4815|0;
 $749 = sp + 104|0;
 $754 = sp + 4814|0;
 $765 = sp + 4813|0;
 $771 = sp + 1980|0;
 $772 = sp + 96|0;
 $775 = sp + 1968|0;
 $776 = sp + 4812|0;
 $777 = sp + 88|0;
 $781 = sp + 4811|0;
 $805 = sp + 80|0;
 $810 = sp + 4810|0;
 $821 = sp + 4809|0;
 $830 = sp + 72|0;
 $835 = sp + 4808|0;
 $845 = sp + 4807|0;
 $853 = sp + 1692|0;
 $854 = sp + 64|0;
 $857 = sp + 1680|0;
 $858 = sp + 4806|0;
 $859 = sp + 56|0;
 $863 = sp + 4805|0;
 $887 = sp + 48|0;
 $892 = sp + 4804|0;
 $903 = sp + 4803|0;
 $913 = sp + 1480|0;
 $916 = sp + 1468|0;
 $920 = sp + 1452|0;
 $923 = sp + 1440|0;
 $931 = sp + 40|0;
 $934 = sp + 4802|0;
 $940 = sp + 32|0;
 $943 = sp + 4801|0;
 $949 = sp + 24|0;
 $952 = sp + 4800|0;
 $958 = sp + 16|0;
 $961 = sp + 4799|0;
 $967 = sp + 8|0;
 $970 = sp + 4798|0;
 $976 = sp;
 $979 = sp + 4797|0;
 $989 = sp + 1224|0;
 $992 = sp + 1212|0;
 $996 = sp + 1196|0;
 $999 = sp + 1184|0;
 $1004 = sp + 1164|0;
 $1007 = sp + 1152|0;
 $1014 = sp + 1124|0;
 $1017 = sp + 1112|0;
 $1024 = sp + 1084|0;
 $1027 = sp + 1072|0;
 $1032 = sp + 1052|0;
 $1038 = sp + 1020|0;
 $1039 = sp + 1008|0;
 $1040 = sp + 996|0;
 $1041 = sp + 992|0;
 $1042 = sp + 988|0;
 $1043 = sp + 984|0;
 $1044 = sp + 980|0;
 $1045 = sp + 976|0;
 $1046 = sp + 972|0;
 $1048 = sp + 964|0;
 $1049 = sp + 960|0;
 $1050 = sp + 936|0;
 $1053 = sp + 916|0;
 $1055 = sp + 908|0;
 $1056 = sp + 904|0;
 $1057 = sp + 880|0;
 $1058 = sp + 868|0;
 $1062 = sp + 844|0;
 $1063 = sp + 832|0;
 $1064 = sp + 820|0;
 $1065 = sp + 808|0;
 $1066 = sp + 796|0;
 $1067 = sp + 784|0;
 $1068 = sp + 772|0;
 $1069 = sp + 760|0;
 $1070 = sp + 748|0;
 $1071 = sp + 736|0;
 $1072 = sp + 724|0;
 $1073 = sp + 712|0;
 $1074 = sp + 700|0;
 $1075 = sp + 688|0;
 $1076 = sp + 676|0;
 $1077 = sp + 664|0;
 $1078 = sp + 652|0;
 $1079 = sp + 640|0;
 $1080 = sp + 628|0;
 $1081 = sp + 616|0;
 $1082 = sp + 604|0;
 $1083 = sp + 592|0;
 $1084 = sp + 580|0;
 $1085 = sp + 568|0;
 $1086 = sp + 564|0;
 $1087 = sp + 4796|0;
 $1088 = sp + 560|0;
 $1089 = sp + 556|0;
 $1090 = sp + 552|0;
 $1091 = sp + 548|0;
 $1092 = sp + 544|0;
 $1093 = sp + 540|0;
 $1094 = sp + 536|0;
 $1095 = sp + 532|0;
 $1096 = sp + 528|0;
 $1099 = sp + 516|0;
 $1100 = sp + 512|0;
 $1101 = sp + 508|0;
 $1104 = sp + 496|0;
 $1105 = sp + 492|0;
 $1106 = sp + 488|0;
 $1108 = sp + 480|0;
 $1109 = sp + 476|0;
 $1110 = sp + 472|0;
 $1111 = sp + 468|0;
 $1112 = sp + 464|0;
 $1115 = sp + 452|0;
 $1116 = sp + 448|0;
 $1117 = sp + 444|0;
 $1118 = sp + 440|0;
 $1119 = sp + 436|0;
 $1120 = sp + 432|0;
 $1121 = sp + 428|0;
 $1122 = sp + 424|0;
 $1123 = sp + 420|0;
 $1124 = sp + 416|0;
 $1125 = sp + 412|0;
 $1126 = sp + 408|0;
 $1127 = sp + 404|0;
 $1128 = sp + 400|0;
 $1129 = sp + 396|0;
 $1130 = sp + 392|0;
 $1131 = sp + 388|0;
 $1134 = (__Znaj(80)|0);
 $1033 = $1134;
 $1034 = 0;
 while(1) {
  $1135 = $1034;
  $1136 = ($1135|0)<(20);
  if (!($1136)) {
   break;
  }
  $1137 = (__Znaj(80)|0);
  $1138 = $1033;
  $1139 = $1034;
  $1140 = (($1138) + ($1139<<2)|0);
  HEAP32[$1140>>2] = $1137;
  $1035 = 0;
  while(1) {
   $1141 = $1035;
   $1142 = ($1141|0)<(20);
   if (!($1142)) {
    break;
   }
   $1143 = (__Znaj(20)|0);
   $1144 = $1033;
   $1145 = $1034;
   $1146 = (($1144) + ($1145<<2)|0);
   $1147 = HEAP32[$1146>>2]|0;
   $1148 = $1035;
   $1149 = (($1147) + ($1148<<2)|0);
   HEAP32[$1149>>2] = $1143;
   $1036 = 0;
   while(1) {
    $1150 = $1036;
    $1151 = ($1150|0)<(20);
    if (!($1151)) {
     break;
    }
    $1152 = $1033;
    $1153 = $1034;
    $1154 = (($1152) + ($1153<<2)|0);
    $1155 = HEAP32[$1154>>2]|0;
    $1156 = $1035;
    $1157 = (($1155) + ($1156<<2)|0);
    $1158 = HEAP32[$1157>>2]|0;
    $1159 = $1036;
    $1160 = (($1158) + ($1159)|0);
    HEAP8[$1160>>0] = 0;
    $1161 = $1036;
    $1162 = (($1161) + 1)|0;
    $1036 = $1162;
   }
   $1163 = $1035;
   $1164 = (($1163) + 1)|0;
   $1035 = $1164;
  }
  $1165 = $1034;
  $1166 = (($1165) + 1)|0;
  $1034 = $1166;
 }
 $1031 = $0;
 $1167 = $1031;
 $1168 = ((($1167)) + 4|0);
 $1169 = HEAP32[$1168>>2]|0;
 $1170 = HEAP32[$1167>>2]|0;
 $1171 = $1169;
 $1172 = $1170;
 $1173 = (($1171) - ($1172))|0;
 $1174 = (($1173|0) / 24)&-1;
 $1037 = $1174;
 $1030 = $1038;
 $1175 = $1030;
 $1029 = $1175;
 $1176 = $1029;
 $1028 = $1176;
 HEAP32[$1176>>2] = 0;
 $1177 = ((($1176)) + 4|0);
 HEAP32[$1177>>2] = 0;
 $1178 = ((($1176)) + 8|0);
 $1026 = $1178;
 HEAP32[$1027>>2] = 0;
 $1179 = $1026;
 $1025 = $1027;
 $1180 = $1025;
 $1181 = HEAP32[$1180>>2]|0;
 $1023 = $1179;
 HEAP32[$1024>>2] = $1181;
 $1182 = $1023;
 $1022 = $1182;
 $1021 = $1024;
 $1183 = $1021;
 $1184 = HEAP32[$1183>>2]|0;
 HEAP32[$1182>>2] = $1184;
 $1020 = $1039;
 $1185 = $1020;
 $1019 = $1185;
 $1186 = $1019;
 $1018 = $1186;
 HEAP32[$1186>>2] = 0;
 $1187 = ((($1186)) + 4|0);
 HEAP32[$1187>>2] = 0;
 $1188 = ((($1186)) + 8|0);
 $1016 = $1188;
 HEAP32[$1017>>2] = 0;
 $1189 = $1016;
 $1015 = $1017;
 $1190 = $1015;
 $1191 = HEAP32[$1190>>2]|0;
 $1013 = $1189;
 HEAP32[$1014>>2] = $1191;
 $1192 = $1013;
 $1012 = $1192;
 $1011 = $1014;
 $1193 = $1011;
 $1194 = HEAP32[$1193>>2]|0;
 HEAP32[$1192>>2] = $1194;
 $1010 = $1040;
 $1195 = $1010;
 $1009 = $1195;
 $1196 = $1009;
 $1008 = $1196;
 HEAP32[$1196>>2] = 0;
 $1197 = ((($1196)) + 4|0);
 HEAP32[$1197>>2] = 0;
 $1198 = ((($1196)) + 8|0);
 $1006 = $1198;
 HEAP32[$1007>>2] = 0;
 $1199 = $1006;
 $1005 = $1007;
 $1200 = $1005;
 $1201 = HEAP32[$1200>>2]|0;
 $1003 = $1199;
 HEAP32[$1004>>2] = $1201;
 $1202 = $1003;
 $1002 = $1202;
 $1001 = $1004;
 $1203 = $1001;
 $1204 = HEAP32[$1203>>2]|0;
 HEAP32[$1202>>2] = $1204;
 HEAP32[$1041>>2] = 2147483647;
 HEAP32[$1042>>2] = -2147483648;
 HEAP32[$1043>>2] = 2147483647;
 HEAP32[$1044>>2] = -2147483648;
 HEAP32[$1045>>2] = 2147483647;
 HEAP32[$1046>>2] = -2147483648;
 $1047 = $0;
 $1205 = $1047;
 $1000 = $1205;
 $1206 = $1000;
 $1207 = HEAP32[$1206>>2]|0;
 $997 = $1206;
 $998 = $1207;
 $1208 = $998;
 $994 = $996;
 $995 = $1208;
 $1209 = $994;
 $1210 = $995;
 HEAP32[$1209>>2] = $1210;
 $1211 = HEAP32[$996>>2]|0;
 HEAP32[$999>>2] = $1211;
 $1212 = HEAP32[$999>>2]|0;
 HEAP32[$1048>>2] = $1212;
 $1213 = $1047;
 $993 = $1213;
 $1214 = $993;
 $1215 = ((($1214)) + 4|0);
 $1216 = HEAP32[$1215>>2]|0;
 $990 = $1214;
 $991 = $1216;
 $1217 = $991;
 $987 = $989;
 $988 = $1217;
 $1218 = $987;
 $1219 = $988;
 HEAP32[$1218>>2] = $1219;
 $1220 = HEAP32[$989>>2]|0;
 HEAP32[$992>>2] = $1220;
 $1221 = HEAP32[$992>>2]|0;
 HEAP32[$1049>>2] = $1221;
 while(1) {
  $985 = $1048;
  $986 = $1049;
  $1222 = $985;
  $1223 = $986;
  $983 = $1222;
  $984 = $1223;
  $1224 = $983;
  $982 = $1224;
  $1225 = $982;
  $1226 = HEAP32[$1225>>2]|0;
  $1227 = $984;
  $981 = $1227;
  $1228 = $981;
  $1229 = HEAP32[$1228>>2]|0;
  $1230 = ($1226|0)==($1229|0);
  $1231 = $1230 ^ 1;
  if (!($1231)) {
   label = 15;
   break;
  }
  $980 = $1048;
  $1232 = $980;
  $1233 = HEAP32[$1232>>2]|0;
  __THREW__ = 0;
  invoke_vii(51,($1050|0),($1233|0));
  $1234 = __THREW__; __THREW__ = 0;
  $1235 = $1234&1;
  if ($1235) {
   break;
  }
  ;HEAP32[$1053>>2]=HEAP32[$1050>>2]|0;HEAP32[$1053+4>>2]=HEAP32[$1050+4>>2]|0;HEAP32[$1053+8>>2]=HEAP32[$1050+8>>2]|0;
  $1236 = $1033;
  $1237 = HEAP32[$1053>>2]|0;
  $1238 = (Math_abs(($1237|0))|0);
  $1239 = (($1238|0) % 20)&-1;
  $1240 = (($1236) + ($1239<<2)|0);
  $1241 = HEAP32[$1240>>2]|0;
  $1242 = ((($1053)) + 4|0);
  $1243 = HEAP32[$1242>>2]|0;
  $1244 = (Math_abs(($1243|0))|0);
  $1245 = (($1244|0) % 20)&-1;
  $1246 = (($1241) + ($1245<<2)|0);
  $1247 = HEAP32[$1246>>2]|0;
  $1248 = ((($1053)) + 8|0);
  $1249 = HEAP32[$1248>>2]|0;
  $1250 = (Math_abs(($1249|0))|0);
  $1251 = (($1250|0) % 20)&-1;
  $1252 = (($1247) + ($1251)|0);
  HEAP8[$1252>>0] = 1;
  $977 = $1041;
  $978 = $1053;
  $1253 = $977;
  $1254 = $978;
  ;HEAP8[$976>>0]=HEAP8[$979>>0]|0;
  $974 = $1253;
  $975 = $1254;
  $1255 = $975;
  $1256 = $974;
  $971 = $976;
  $972 = $1255;
  $973 = $1256;
  $1257 = $972;
  $1258 = HEAP32[$1257>>2]|0;
  $1259 = $973;
  $1260 = HEAP32[$1259>>2]|0;
  $1261 = ($1258|0)<($1260|0);
  $1262 = $975;
  $1263 = $974;
  $1264 = $1261 ? $1262 : $1263;
  $1265 = HEAP32[$1264>>2]|0;
  HEAP32[$1041>>2] = $1265;
  $968 = $1042;
  $969 = $1053;
  $1266 = $968;
  $1267 = $969;
  ;HEAP8[$967>>0]=HEAP8[$970>>0]|0;
  $965 = $1266;
  $966 = $1267;
  $1268 = $965;
  $1269 = $966;
  $962 = $967;
  $963 = $1268;
  $964 = $1269;
  $1270 = $963;
  $1271 = HEAP32[$1270>>2]|0;
  $1272 = $964;
  $1273 = HEAP32[$1272>>2]|0;
  $1274 = ($1271|0)<($1273|0);
  $1275 = $966;
  $1276 = $965;
  $1277 = $1274 ? $1275 : $1276;
  $1278 = HEAP32[$1277>>2]|0;
  HEAP32[$1042>>2] = $1278;
  $1279 = ((($1053)) + 4|0);
  $959 = $1043;
  $960 = $1279;
  $1280 = $959;
  $1281 = $960;
  ;HEAP8[$958>>0]=HEAP8[$961>>0]|0;
  $956 = $1280;
  $957 = $1281;
  $1282 = $957;
  $1283 = $956;
  $953 = $958;
  $954 = $1282;
  $955 = $1283;
  $1284 = $954;
  $1285 = HEAP32[$1284>>2]|0;
  $1286 = $955;
  $1287 = HEAP32[$1286>>2]|0;
  $1288 = ($1285|0)<($1287|0);
  $1289 = $957;
  $1290 = $956;
  $1291 = $1288 ? $1289 : $1290;
  $1292 = HEAP32[$1291>>2]|0;
  HEAP32[$1043>>2] = $1292;
  $1293 = ((($1053)) + 4|0);
  $950 = $1044;
  $951 = $1293;
  $1294 = $950;
  $1295 = $951;
  ;HEAP8[$949>>0]=HEAP8[$952>>0]|0;
  $947 = $1294;
  $948 = $1295;
  $1296 = $947;
  $1297 = $948;
  $944 = $949;
  $945 = $1296;
  $946 = $1297;
  $1298 = $945;
  $1299 = HEAP32[$1298>>2]|0;
  $1300 = $946;
  $1301 = HEAP32[$1300>>2]|0;
  $1302 = ($1299|0)<($1301|0);
  $1303 = $948;
  $1304 = $947;
  $1305 = $1302 ? $1303 : $1304;
  $1306 = HEAP32[$1305>>2]|0;
  HEAP32[$1044>>2] = $1306;
  $1307 = ((($1053)) + 8|0);
  $941 = $1045;
  $942 = $1307;
  $1308 = $941;
  $1309 = $942;
  ;HEAP8[$940>>0]=HEAP8[$943>>0]|0;
  $938 = $1308;
  $939 = $1309;
  $1310 = $939;
  $1311 = $938;
  $935 = $940;
  $936 = $1310;
  $937 = $1311;
  $1312 = $936;
  $1313 = HEAP32[$1312>>2]|0;
  $1314 = $937;
  $1315 = HEAP32[$1314>>2]|0;
  $1316 = ($1313|0)<($1315|0);
  $1317 = $939;
  $1318 = $938;
  $1319 = $1316 ? $1317 : $1318;
  $1320 = HEAP32[$1319>>2]|0;
  HEAP32[$1045>>2] = $1320;
  $1321 = ((($1053)) + 8|0);
  $932 = $1046;
  $933 = $1321;
  $1322 = $932;
  $1323 = $933;
  ;HEAP8[$931>>0]=HEAP8[$934>>0]|0;
  $929 = $1322;
  $930 = $1323;
  $1324 = $929;
  $1325 = $930;
  $926 = $931;
  $927 = $1324;
  $928 = $1325;
  $1326 = $927;
  $1327 = HEAP32[$1326>>2]|0;
  $1328 = $928;
  $1329 = HEAP32[$1328>>2]|0;
  $1330 = ($1327|0)<($1329|0);
  $1331 = $930;
  $1332 = $929;
  $1333 = $1330 ? $1331 : $1332;
  $1334 = HEAP32[$1333>>2]|0;
  HEAP32[$1046>>2] = $1334;
  __ZN5BlockD2Ev($1050);
  $925 = $1048;
  $1335 = $925;
  $1336 = HEAP32[$1335>>2]|0;
  $1337 = ((($1336)) + 24|0);
  HEAP32[$1335>>2] = $1337;
 }
 L17: do {
  if ((label|0) == 15) {
   $1054 = $0;
   $1340 = $1054;
   $924 = $1340;
   $1341 = $924;
   $1342 = HEAP32[$1341>>2]|0;
   $921 = $1341;
   $922 = $1342;
   $1343 = $922;
   $918 = $920;
   $919 = $1343;
   $1344 = $918;
   $1345 = $919;
   HEAP32[$1344>>2] = $1345;
   $1346 = HEAP32[$920>>2]|0;
   HEAP32[$923>>2] = $1346;
   $1347 = HEAP32[$923>>2]|0;
   HEAP32[$1055>>2] = $1347;
   $1348 = $1054;
   $917 = $1348;
   $1349 = $917;
   $1350 = ((($1349)) + 4|0);
   $1351 = HEAP32[$1350>>2]|0;
   $914 = $1349;
   $915 = $1351;
   $1352 = $915;
   $911 = $913;
   $912 = $1352;
   $1353 = $911;
   $1354 = $912;
   HEAP32[$1353>>2] = $1354;
   $1355 = HEAP32[$913>>2]|0;
   HEAP32[$916>>2] = $1355;
   $1356 = HEAP32[$916>>2]|0;
   HEAP32[$1056>>2] = $1356;
   while(1) {
    $909 = $1055;
    $910 = $1056;
    $1357 = $909;
    $1358 = $910;
    $907 = $1357;
    $908 = $1358;
    $1359 = $907;
    $906 = $1359;
    $1360 = $906;
    $1361 = HEAP32[$1360>>2]|0;
    $1362 = $908;
    $905 = $1362;
    $1363 = $905;
    $1364 = HEAP32[$1363>>2]|0;
    $1365 = ($1361|0)==($1364|0);
    $1366 = $1365 ^ 1;
    if (!($1366)) {
     label = 147;
     break;
    }
    $904 = $1055;
    $1367 = $904;
    $1368 = HEAP32[$1367>>2]|0;
    __THREW__ = 0;
    invoke_vii(51,($1057|0),($1368|0));
    $1369 = __THREW__; __THREW__ = 0;
    $1370 = $1369&1;
    if ($1370) {
     break L17;
    }
    ;HEAP32[$1058>>2]=HEAP32[$1057>>2]|0;HEAP32[$1058+4>>2]=HEAP32[$1057+4>>2]|0;HEAP32[$1058+8>>2]=HEAP32[$1057+8>>2]|0;
    $1371 = HEAP32[$1058>>2]|0;
    $1059 = $1371;
    $1372 = ((($1058)) + 4|0);
    $1373 = HEAP32[$1372>>2]|0;
    $1060 = $1373;
    $1374 = ((($1058)) + 8|0);
    $1375 = HEAP32[$1374>>2]|0;
    $1061 = $1375;
    $1376 = $1059;
    $1377 = (($1376) + 1)|0;
    $1378 = HEAP32[$1042>>2]|0;
    $1379 = ($1377|0)>($1378|0);
    if ($1379) {
     label = 21;
    } else {
     $1380 = $1033;
     $1381 = $1059;
     $1382 = (($1381) + 1)|0;
     $1383 = $1060;
     $1384 = $1061;
     __THREW__ = 0;
     $1385 = (invoke_iiiii(52,($1380|0),($1382|0),($1383|0),($1384|0))|0);
     $1386 = __THREW__; __THREW__ = 0;
     $1387 = $1386&1;
     if ($1387) {
      label = 35;
      break;
     }
     if ($1385) {
      label = 21;
     }
    }
    if ((label|0) == 21) {
     label = 0;
     ;HEAP32[$1063>>2]=HEAP32[$1058>>2]|0;HEAP32[$1063+4>>2]=HEAP32[$1058+4>>2]|0;HEAP32[$1063+8>>2]=HEAP32[$1058+8>>2]|0;
     __THREW__ = 0;
     ;HEAP32[$$byval_copy>>2]=HEAP32[$1063>>2]|0;HEAP32[$$byval_copy+4>>2]=HEAP32[$1063+4>>2]|0;HEAP32[$$byval_copy+8>>2]=HEAP32[$1063+8>>2]|0;
     invoke_viii(53,($1062|0),($$byval_copy|0),0);
     $1388 = __THREW__; __THREW__ = 0;
     $1389 = $1388&1;
     if ($1389) {
      label = 35;
      break;
     }
     $901 = $1038;
     $902 = $1062;
     $1390 = $901;
     $1391 = ((($1390)) + 4|0);
     $1392 = HEAP32[$1391>>2]|0;
     $900 = $1390;
     $1393 = $900;
     $1394 = ((($1393)) + 8|0);
     $899 = $1394;
     $1395 = $899;
     $898 = $1395;
     $1396 = $898;
     $1397 = HEAP32[$1396>>2]|0;
     $1398 = ($1392>>>0)<($1397>>>0);
     if ($1398) {
      __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotatorC2ERKS5_j($903,$1390,1);
      $897 = $1390;
      $1399 = $897;
      $1400 = ((($1399)) + 8|0);
      $896 = $1400;
      $1401 = $896;
      $895 = $1401;
      $1402 = $895;
      $1403 = ((($1390)) + 4|0);
      $1404 = HEAP32[$1403>>2]|0;
      $893 = $1404;
      $1405 = $893;
      $1406 = $902;
      $848 = $1406;
      $1407 = $848;
      $889 = $1402;
      $890 = $1405;
      $891 = $1407;
      $1408 = $889;
      $1409 = $890;
      $1410 = $891;
      $888 = $1410;
      $1411 = $888;
      ;HEAP8[$887>>0]=HEAP8[$892>>0]|0;
      $884 = $1408;
      $885 = $1409;
      $886 = $1411;
      $1412 = $884;
      $1413 = $885;
      $1414 = $886;
      $883 = $1414;
      $1415 = $883;
      $880 = $1412;
      $881 = $1413;
      $882 = $1415;
      $1416 = $881;
      $1417 = $882;
      $879 = $1417;
      $1418 = $879;
      $877 = $1416;
      $878 = $1418;
      $1419 = $877;
      $1420 = $878;
      $876 = $1420;
      $1421 = $876;
      $1422 = ((($1421)) + 8|0);
      $875 = $1422;
      $1423 = $875;
      $874 = $1423;
      $1424 = $874;
      $873 = $1424;
      $1425 = $873;
      $861 = $1419;
      $862 = $1425;
      $1426 = $861;
      $860 = $1426;
      HEAP32[$1426>>2] = 0;
      $1427 = ((($1426)) + 4|0);
      HEAP32[$1427>>2] = 0;
      $1428 = ((($1426)) + 8|0);
      ;HEAP8[$859>>0]=HEAP8[$863>>0]|0;
      $856 = $1428;
      HEAP32[$857>>2] = 0;
      $1429 = $856;
      $855 = $857;
      $1430 = $855;
      $1431 = HEAP32[$1430>>2]|0;
      $849 = $859;
      ;HEAP8[$854>>0]=HEAP8[$858>>0]|0;
      $852 = $1429;
      HEAP32[$853>>2] = $1431;
      $1432 = $852;
      $851 = $854;
      $850 = $853;
      $1433 = $850;
      $1434 = HEAP32[$1433>>2]|0;
      HEAP32[$1432>>2] = $1434;
      $1435 = $878;
      $1436 = HEAP32[$1435>>2]|0;
      HEAP32[$1419>>2] = $1436;
      $1437 = $878;
      $1438 = ((($1437)) + 4|0);
      $1439 = HEAP32[$1438>>2]|0;
      $1440 = ((($1419)) + 4|0);
      HEAP32[$1440>>2] = $1439;
      $1441 = $878;
      $866 = $1441;
      $1442 = $866;
      $1443 = ((($1442)) + 8|0);
      $865 = $1443;
      $1444 = $865;
      $864 = $1444;
      $1445 = $864;
      $1446 = HEAP32[$1445>>2]|0;
      $869 = $1419;
      $1447 = $869;
      $1448 = ((($1447)) + 8|0);
      $868 = $1448;
      $1449 = $868;
      $867 = $1449;
      $1450 = $867;
      HEAP32[$1450>>2] = $1446;
      $1451 = $878;
      $872 = $1451;
      $1452 = $872;
      $1453 = ((($1452)) + 8|0);
      $871 = $1453;
      $1454 = $871;
      $870 = $1454;
      $1455 = $870;
      HEAP32[$1455>>2] = 0;
      $1456 = $878;
      $1457 = ((($1456)) + 4|0);
      HEAP32[$1457>>2] = 0;
      $1458 = $878;
      HEAP32[$1458>>2] = 0;
      __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotator6__doneEv($903);
      $1459 = ((($1390)) + 4|0);
      $1460 = HEAP32[$1459>>2]|0;
      $1461 = ((($1460)) + 12|0);
      HEAP32[$1459>>2] = $1461;
     } else {
      $1462 = $902;
      $894 = $1462;
      $1463 = $894;
      __THREW__ = 0;
      invoke_vii(54,($1390|0),($1463|0));
      $1464 = __THREW__; __THREW__ = 0;
      $1465 = $1464&1;
      if ($1465) {
       label = 36;
       break;
      }
     }
     __ZNSt3__26vectorIiNS_9allocatorIiEEED2Ev($1062);
     $846 = 6672;
     $847 = 0;
     $1466 = $846;
     $1467 = HEAP32[$1466>>2]|0;
     $1468 = $847;
     $1469 = (($1467) + (($1468*12)|0)|0);
     $843 = $1039;
     $844 = $1469;
     $1470 = $843;
     $1471 = ((($1470)) + 4|0);
     $1472 = HEAP32[$1471>>2]|0;
     $842 = $1470;
     $1473 = $842;
     $1474 = ((($1473)) + 8|0);
     $841 = $1474;
     $1475 = $841;
     $840 = $1475;
     $1476 = $840;
     $1477 = HEAP32[$1476>>2]|0;
     $1478 = ($1472|0)!=($1477|0);
     if ($1478) {
      __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotatorC2ERKS5_j($845,$1470,1);
      $839 = $1470;
      $1479 = $839;
      $1480 = ((($1479)) + 8|0);
      $838 = $1480;
      $1481 = $838;
      $837 = $1481;
      $1482 = $837;
      $1483 = ((($1470)) + 4|0);
      $1484 = HEAP32[$1483>>2]|0;
      $836 = $1484;
      $1485 = $836;
      $1486 = $844;
      $832 = $1482;
      $833 = $1485;
      $834 = $1486;
      $1487 = $832;
      $1488 = $833;
      $1489 = $834;
      $831 = $1489;
      $1490 = $831;
      ;HEAP8[$830>>0]=HEAP8[$835>>0]|0;
      $827 = $1487;
      $828 = $1488;
      $829 = $1490;
      $1491 = $827;
      $1492 = $828;
      $1493 = $829;
      $826 = $1493;
      $1494 = $826;
      $823 = $1491;
      $824 = $1492;
      $825 = $1494;
      $1495 = $824;
      $1496 = $825;
      $822 = $1496;
      $1497 = $822;
      __THREW__ = 0;
      invoke_vii(55,($1495|0),($1497|0));
      $1498 = __THREW__; __THREW__ = 0;
      $1499 = $1498&1;
      if ($1499) {
       label = 35;
       break;
      }
      __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotator6__doneEv($845);
      $1500 = ((($1470)) + 4|0);
      $1501 = HEAP32[$1500>>2]|0;
      $1502 = ((($1501)) + 12|0);
      HEAP32[$1500>>2] = $1502;
     } else {
      $1503 = $844;
      __THREW__ = 0;
      invoke_vii(56,($1470|0),($1503|0));
      $1504 = __THREW__; __THREW__ = 0;
      $1505 = $1504&1;
      if ($1505) {
       label = 35;
       break;
      }
     }
     $1506 = ((($1057)) + 12|0);
     __THREW__ = 0;
     invoke_vii(57,($1065|0),($1506|0));
     $1507 = __THREW__; __THREW__ = 0;
     $1508 = $1507&1;
     if ($1508) {
      label = 35;
      break;
     }
     __THREW__ = 0;
     invoke_viii(58,($1064|0),($1065|0),0);
     $1509 = __THREW__; __THREW__ = 0;
     $1510 = $1509&1;
     if ($1510) {
      label = 37;
      break;
     }
     $819 = $1040;
     $820 = $1064;
     $1511 = $819;
     $1512 = ((($1511)) + 4|0);
     $1513 = HEAP32[$1512>>2]|0;
     $818 = $1511;
     $1514 = $818;
     $1515 = ((($1514)) + 8|0);
     $817 = $1515;
     $1516 = $817;
     $816 = $1516;
     $1517 = $816;
     $1518 = HEAP32[$1517>>2]|0;
     $1519 = ($1513>>>0)<($1518>>>0);
     if ($1519) {
      __ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE24__RAII_IncreaseAnnotatorC2ERKS5_j($821,$1511,1);
      $815 = $1511;
      $1520 = $815;
      $1521 = ((($1520)) + 8|0);
      $814 = $1521;
      $1522 = $814;
      $813 = $1522;
      $1523 = $813;
      $1524 = ((($1511)) + 4|0);
      $1525 = HEAP32[$1524>>2]|0;
      $811 = $1525;
      $1526 = $811;
      $1527 = $820;
      $766 = $1527;
      $1528 = $766;
      $807 = $1523;
      $808 = $1526;
      $809 = $1528;
      $1529 = $807;
      $1530 = $808;
      $1531 = $809;
      $806 = $1531;
      $1532 = $806;
      ;HEAP8[$805>>0]=HEAP8[$810>>0]|0;
      $802 = $1529;
      $803 = $1530;
      $804 = $1532;
      $1533 = $802;
      $1534 = $803;
      $1535 = $804;
      $801 = $1535;
      $1536 = $801;
      $798 = $1533;
      $799 = $1534;
      $800 = $1536;
      $1537 = $799;
      $1538 = $800;
      $797 = $1538;
      $1539 = $797;
      $795 = $1537;
      $796 = $1539;
      $1540 = $795;
      $1541 = $796;
      $794 = $1541;
      $1542 = $794;
      $1543 = ((($1542)) + 8|0);
      $793 = $1543;
      $1544 = $793;
      $792 = $1544;
      $1545 = $792;
      $791 = $1545;
      $1546 = $791;
      $779 = $1540;
      $780 = $1546;
      $1547 = $779;
      $778 = $1547;
      HEAP32[$1547>>2] = 0;
      $1548 = ((($1547)) + 4|0);
      HEAP32[$1548>>2] = 0;
      $1549 = ((($1547)) + 8|0);
      ;HEAP8[$777>>0]=HEAP8[$781>>0]|0;
      $774 = $1549;
      HEAP32[$775>>2] = 0;
      $1550 = $774;
      $773 = $775;
      $1551 = $773;
      $1552 = HEAP32[$1551>>2]|0;
      $767 = $777;
      ;HEAP8[$772>>0]=HEAP8[$776>>0]|0;
      $770 = $1550;
      HEAP32[$771>>2] = $1552;
      $1553 = $770;
      $769 = $772;
      $768 = $771;
      $1554 = $768;
      $1555 = HEAP32[$1554>>2]|0;
      HEAP32[$1553>>2] = $1555;
      $1556 = $796;
      $1557 = HEAP32[$1556>>2]|0;
      HEAP32[$1540>>2] = $1557;
      $1558 = $796;
      $1559 = ((($1558)) + 4|0);
      $1560 = HEAP32[$1559>>2]|0;
      $1561 = ((($1540)) + 4|0);
      HEAP32[$1561>>2] = $1560;
      $1562 = $796;
      $784 = $1562;
      $1563 = $784;
      $1564 = ((($1563)) + 8|0);
      $783 = $1564;
      $1565 = $783;
      $782 = $1565;
      $1566 = $782;
      $1567 = HEAP32[$1566>>2]|0;
      $787 = $1540;
      $1568 = $787;
      $1569 = ((($1568)) + 8|0);
      $786 = $1569;
      $1570 = $786;
      $785 = $1570;
      $1571 = $785;
      HEAP32[$1571>>2] = $1567;
      $1572 = $796;
      $790 = $1572;
      $1573 = $790;
      $1574 = ((($1573)) + 8|0);
      $789 = $1574;
      $1575 = $789;
      $788 = $1575;
      $1576 = $788;
      HEAP32[$1576>>2] = 0;
      $1577 = $796;
      $1578 = ((($1577)) + 4|0);
      HEAP32[$1578>>2] = 0;
      $1579 = $796;
      HEAP32[$1579>>2] = 0;
      __ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE24__RAII_IncreaseAnnotator6__doneEv($821);
      $1580 = ((($1511)) + 4|0);
      $1581 = HEAP32[$1580>>2]|0;
      $1582 = ((($1581)) + 12|0);
      HEAP32[$1580>>2] = $1582;
     } else {
      $1583 = $820;
      $812 = $1583;
      $1584 = $812;
      __THREW__ = 0;
      invoke_vii(59,($1511|0),($1584|0));
      $1585 = __THREW__; __THREW__ = 0;
      $1586 = $1585&1;
      if ($1586) {
       label = 38;
       break;
      }
     }
     __ZNSt3__26vectorIfNS_9allocatorIfEEED2Ev($1064);
     __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($1065);
    }
    $1595 = $1059;
    $1596 = (($1595) - 1)|0;
    $1597 = HEAP32[$1041>>2]|0;
    $1598 = ($1596|0)<($1597|0);
    if ($1598) {
     label = 43;
    } else {
     $1599 = $1033;
     $1600 = $1059;
     $1601 = (($1600) - 1)|0;
     $1602 = $1060;
     $1603 = $1061;
     __THREW__ = 0;
     $1604 = (invoke_iiiii(52,($1599|0),($1601|0),($1602|0),($1603|0))|0);
     $1605 = __THREW__; __THREW__ = 0;
     $1606 = $1605&1;
     if ($1606) {
      label = 35;
      break;
     }
     if ($1604) {
      label = 43;
     }
    }
    if ((label|0) == 43) {
     label = 0;
     ;HEAP32[$1067>>2]=HEAP32[$1058>>2]|0;HEAP32[$1067+4>>2]=HEAP32[$1058+4>>2]|0;HEAP32[$1067+8>>2]=HEAP32[$1058+8>>2]|0;
     __THREW__ = 0;
     ;HEAP32[$$byval_copy1>>2]=HEAP32[$1067>>2]|0;HEAP32[$$byval_copy1+4>>2]=HEAP32[$1067+4>>2]|0;HEAP32[$$byval_copy1+8>>2]=HEAP32[$1067+8>>2]|0;
     invoke_viii(53,($1066|0),($$byval_copy1|0),1);
     $1607 = __THREW__; __THREW__ = 0;
     $1608 = $1607&1;
     if ($1608) {
      label = 35;
      break;
     }
     $763 = $1038;
     $764 = $1066;
     $1609 = $763;
     $1610 = ((($1609)) + 4|0);
     $1611 = HEAP32[$1610>>2]|0;
     $762 = $1609;
     $1612 = $762;
     $1613 = ((($1612)) + 8|0);
     $761 = $1613;
     $1614 = $761;
     $760 = $1614;
     $1615 = $760;
     $1616 = HEAP32[$1615>>2]|0;
     $1617 = ($1611>>>0)<($1616>>>0);
     if ($1617) {
      __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotatorC2ERKS5_j($765,$1609,1);
      $759 = $1609;
      $1618 = $759;
      $1619 = ((($1618)) + 8|0);
      $758 = $1619;
      $1620 = $758;
      $757 = $1620;
      $1621 = $757;
      $1622 = ((($1609)) + 4|0);
      $1623 = HEAP32[$1622>>2]|0;
      $755 = $1623;
      $1624 = $755;
      $1625 = $764;
      $710 = $1625;
      $1626 = $710;
      $751 = $1621;
      $752 = $1624;
      $753 = $1626;
      $1627 = $751;
      $1628 = $752;
      $1629 = $753;
      $750 = $1629;
      $1630 = $750;
      ;HEAP8[$749>>0]=HEAP8[$754>>0]|0;
      $746 = $1627;
      $747 = $1628;
      $748 = $1630;
      $1631 = $746;
      $1632 = $747;
      $1633 = $748;
      $745 = $1633;
      $1634 = $745;
      $742 = $1631;
      $743 = $1632;
      $744 = $1634;
      $1635 = $743;
      $1636 = $744;
      $741 = $1636;
      $1637 = $741;
      $739 = $1635;
      $740 = $1637;
      $1638 = $739;
      $1639 = $740;
      $738 = $1639;
      $1640 = $738;
      $1641 = ((($1640)) + 8|0);
      $737 = $1641;
      $1642 = $737;
      $736 = $1642;
      $1643 = $736;
      $735 = $1643;
      $1644 = $735;
      $723 = $1638;
      $724 = $1644;
      $1645 = $723;
      $722 = $1645;
      HEAP32[$1645>>2] = 0;
      $1646 = ((($1645)) + 4|0);
      HEAP32[$1646>>2] = 0;
      $1647 = ((($1645)) + 8|0);
      ;HEAP8[$721>>0]=HEAP8[$725>>0]|0;
      $718 = $1647;
      HEAP32[$719>>2] = 0;
      $1648 = $718;
      $717 = $719;
      $1649 = $717;
      $1650 = HEAP32[$1649>>2]|0;
      $711 = $721;
      ;HEAP8[$716>>0]=HEAP8[$720>>0]|0;
      $714 = $1648;
      HEAP32[$715>>2] = $1650;
      $1651 = $714;
      $713 = $716;
      $712 = $715;
      $1652 = $712;
      $1653 = HEAP32[$1652>>2]|0;
      HEAP32[$1651>>2] = $1653;
      $1654 = $740;
      $1655 = HEAP32[$1654>>2]|0;
      HEAP32[$1638>>2] = $1655;
      $1656 = $740;
      $1657 = ((($1656)) + 4|0);
      $1658 = HEAP32[$1657>>2]|0;
      $1659 = ((($1638)) + 4|0);
      HEAP32[$1659>>2] = $1658;
      $1660 = $740;
      $728 = $1660;
      $1661 = $728;
      $1662 = ((($1661)) + 8|0);
      $727 = $1662;
      $1663 = $727;
      $726 = $1663;
      $1664 = $726;
      $1665 = HEAP32[$1664>>2]|0;
      $731 = $1638;
      $1666 = $731;
      $1667 = ((($1666)) + 8|0);
      $730 = $1667;
      $1668 = $730;
      $729 = $1668;
      $1669 = $729;
      HEAP32[$1669>>2] = $1665;
      $1670 = $740;
      $734 = $1670;
      $1671 = $734;
      $1672 = ((($1671)) + 8|0);
      $733 = $1672;
      $1673 = $733;
      $732 = $1673;
      $1674 = $732;
      HEAP32[$1674>>2] = 0;
      $1675 = $740;
      $1676 = ((($1675)) + 4|0);
      HEAP32[$1676>>2] = 0;
      $1677 = $740;
      HEAP32[$1677>>2] = 0;
      __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotator6__doneEv($765);
      $1678 = ((($1609)) + 4|0);
      $1679 = HEAP32[$1678>>2]|0;
      $1680 = ((($1679)) + 12|0);
      HEAP32[$1678>>2] = $1680;
     } else {
      $1681 = $764;
      $756 = $1681;
      $1682 = $756;
      __THREW__ = 0;
      invoke_vii(54,($1609|0),($1682|0));
      $1683 = __THREW__; __THREW__ = 0;
      $1684 = $1683&1;
      if ($1684) {
       label = 57;
       break;
      }
     }
     __ZNSt3__26vectorIiNS_9allocatorIiEEED2Ev($1066);
     $708 = 6672;
     $709 = 1;
     $1685 = $708;
     $1686 = HEAP32[$1685>>2]|0;
     $1687 = $709;
     $1688 = (($1686) + (($1687*12)|0)|0);
     $705 = $1039;
     $706 = $1688;
     $1689 = $705;
     $1690 = ((($1689)) + 4|0);
     $1691 = HEAP32[$1690>>2]|0;
     $704 = $1689;
     $1692 = $704;
     $1693 = ((($1692)) + 8|0);
     $703 = $1693;
     $1694 = $703;
     $702 = $1694;
     $1695 = $702;
     $1696 = HEAP32[$1695>>2]|0;
     $1697 = ($1691|0)!=($1696|0);
     if ($1697) {
      __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotatorC2ERKS5_j($707,$1689,1);
      $701 = $1689;
      $1698 = $701;
      $1699 = ((($1698)) + 8|0);
      $700 = $1699;
      $1700 = $700;
      $699 = $1700;
      $1701 = $699;
      $1702 = ((($1689)) + 4|0);
      $1703 = HEAP32[$1702>>2]|0;
      $698 = $1703;
      $1704 = $698;
      $1705 = $706;
      $694 = $1701;
      $695 = $1704;
      $696 = $1705;
      $1706 = $694;
      $1707 = $695;
      $1708 = $696;
      $693 = $1708;
      $1709 = $693;
      ;HEAP8[$692>>0]=HEAP8[$697>>0]|0;
      $689 = $1706;
      $690 = $1707;
      $691 = $1709;
      $1710 = $689;
      $1711 = $690;
      $1712 = $691;
      $688 = $1712;
      $1713 = $688;
      $685 = $1710;
      $686 = $1711;
      $687 = $1713;
      $1714 = $686;
      $1715 = $687;
      $684 = $1715;
      $1716 = $684;
      __THREW__ = 0;
      invoke_vii(55,($1714|0),($1716|0));
      $1717 = __THREW__; __THREW__ = 0;
      $1718 = $1717&1;
      if ($1718) {
       label = 35;
       break;
      }
      __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotator6__doneEv($707);
      $1719 = ((($1689)) + 4|0);
      $1720 = HEAP32[$1719>>2]|0;
      $1721 = ((($1720)) + 12|0);
      HEAP32[$1719>>2] = $1721;
     } else {
      $1722 = $706;
      __THREW__ = 0;
      invoke_vii(56,($1689|0),($1722|0));
      $1723 = __THREW__; __THREW__ = 0;
      $1724 = $1723&1;
      if ($1724) {
       label = 35;
       break;
      }
     }
     $1725 = ((($1057)) + 12|0);
     __THREW__ = 0;
     invoke_vii(57,($1069|0),($1725|0));
     $1726 = __THREW__; __THREW__ = 0;
     $1727 = $1726&1;
     if ($1727) {
      label = 35;
      break;
     }
     __THREW__ = 0;
     invoke_viii(58,($1068|0),($1069|0),1);
     $1728 = __THREW__; __THREW__ = 0;
     $1729 = $1728&1;
     if ($1729) {
      label = 58;
      break;
     }
     $681 = $1040;
     $682 = $1068;
     $1730 = $681;
     $1731 = ((($1730)) + 4|0);
     $1732 = HEAP32[$1731>>2]|0;
     $680 = $1730;
     $1733 = $680;
     $1734 = ((($1733)) + 8|0);
     $679 = $1734;
     $1735 = $679;
     $678 = $1735;
     $1736 = $678;
     $1737 = HEAP32[$1736>>2]|0;
     $1738 = ($1732>>>0)<($1737>>>0);
     if ($1738) {
      __ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE24__RAII_IncreaseAnnotatorC2ERKS5_j($683,$1730,1);
      $677 = $1730;
      $1739 = $677;
      $1740 = ((($1739)) + 8|0);
      $676 = $1740;
      $1741 = $676;
      $675 = $1741;
      $1742 = $675;
      $1743 = ((($1730)) + 4|0);
      $1744 = HEAP32[$1743>>2]|0;
      $673 = $1744;
      $1745 = $673;
      $1746 = $682;
      $628 = $1746;
      $1747 = $628;
      $669 = $1742;
      $670 = $1745;
      $671 = $1747;
      $1748 = $669;
      $1749 = $670;
      $1750 = $671;
      $668 = $1750;
      $1751 = $668;
      ;HEAP8[$667>>0]=HEAP8[$672>>0]|0;
      $664 = $1748;
      $665 = $1749;
      $666 = $1751;
      $1752 = $664;
      $1753 = $665;
      $1754 = $666;
      $663 = $1754;
      $1755 = $663;
      $660 = $1752;
      $661 = $1753;
      $662 = $1755;
      $1756 = $661;
      $1757 = $662;
      $659 = $1757;
      $1758 = $659;
      $657 = $1756;
      $658 = $1758;
      $1759 = $657;
      $1760 = $658;
      $656 = $1760;
      $1761 = $656;
      $1762 = ((($1761)) + 8|0);
      $655 = $1762;
      $1763 = $655;
      $654 = $1763;
      $1764 = $654;
      $653 = $1764;
      $1765 = $653;
      $641 = $1759;
      $642 = $1765;
      $1766 = $641;
      $640 = $1766;
      HEAP32[$1766>>2] = 0;
      $1767 = ((($1766)) + 4|0);
      HEAP32[$1767>>2] = 0;
      $1768 = ((($1766)) + 8|0);
      ;HEAP8[$639>>0]=HEAP8[$643>>0]|0;
      $636 = $1768;
      HEAP32[$637>>2] = 0;
      $1769 = $636;
      $635 = $637;
      $1770 = $635;
      $1771 = HEAP32[$1770>>2]|0;
      $629 = $639;
      ;HEAP8[$634>>0]=HEAP8[$638>>0]|0;
      $632 = $1769;
      HEAP32[$633>>2] = $1771;
      $1772 = $632;
      $631 = $634;
      $630 = $633;
      $1773 = $630;
      $1774 = HEAP32[$1773>>2]|0;
      HEAP32[$1772>>2] = $1774;
      $1775 = $658;
      $1776 = HEAP32[$1775>>2]|0;
      HEAP32[$1759>>2] = $1776;
      $1777 = $658;
      $1778 = ((($1777)) + 4|0);
      $1779 = HEAP32[$1778>>2]|0;
      $1780 = ((($1759)) + 4|0);
      HEAP32[$1780>>2] = $1779;
      $1781 = $658;
      $646 = $1781;
      $1782 = $646;
      $1783 = ((($1782)) + 8|0);
      $645 = $1783;
      $1784 = $645;
      $644 = $1784;
      $1785 = $644;
      $1786 = HEAP32[$1785>>2]|0;
      $649 = $1759;
      $1787 = $649;
      $1788 = ((($1787)) + 8|0);
      $648 = $1788;
      $1789 = $648;
      $647 = $1789;
      $1790 = $647;
      HEAP32[$1790>>2] = $1786;
      $1791 = $658;
      $652 = $1791;
      $1792 = $652;
      $1793 = ((($1792)) + 8|0);
      $651 = $1793;
      $1794 = $651;
      $650 = $1794;
      $1795 = $650;
      HEAP32[$1795>>2] = 0;
      $1796 = $658;
      $1797 = ((($1796)) + 4|0);
      HEAP32[$1797>>2] = 0;
      $1798 = $658;
      HEAP32[$1798>>2] = 0;
      __ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE24__RAII_IncreaseAnnotator6__doneEv($683);
      $1799 = ((($1730)) + 4|0);
      $1800 = HEAP32[$1799>>2]|0;
      $1801 = ((($1800)) + 12|0);
      HEAP32[$1799>>2] = $1801;
     } else {
      $1802 = $682;
      $674 = $1802;
      $1803 = $674;
      __THREW__ = 0;
      invoke_vii(59,($1730|0),($1803|0));
      $1804 = __THREW__; __THREW__ = 0;
      $1805 = $1804&1;
      if ($1805) {
       label = 59;
       break;
      }
     }
     __ZNSt3__26vectorIfNS_9allocatorIfEEED2Ev($1068);
     __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($1069);
    }
    $1812 = $1060;
    $1813 = (($1812) + 1)|0;
    $1814 = HEAP32[$1044>>2]|0;
    $1815 = ($1813|0)>($1814|0);
    if ($1815) {
     label = 64;
    } else {
     $1816 = $1033;
     $1817 = $1059;
     $1818 = $1060;
     $1819 = (($1818) + 1)|0;
     $1820 = $1061;
     __THREW__ = 0;
     $1821 = (invoke_iiiii(52,($1816|0),($1817|0),($1819|0),($1820|0))|0);
     $1822 = __THREW__; __THREW__ = 0;
     $1823 = $1822&1;
     if ($1823) {
      label = 35;
      break;
     }
     if ($1821) {
      label = 64;
     }
    }
    if ((label|0) == 64) {
     label = 0;
     ;HEAP32[$1071>>2]=HEAP32[$1058>>2]|0;HEAP32[$1071+4>>2]=HEAP32[$1058+4>>2]|0;HEAP32[$1071+8>>2]=HEAP32[$1058+8>>2]|0;
     __THREW__ = 0;
     ;HEAP32[$$byval_copy2>>2]=HEAP32[$1071>>2]|0;HEAP32[$$byval_copy2+4>>2]=HEAP32[$1071+4>>2]|0;HEAP32[$$byval_copy2+8>>2]=HEAP32[$1071+8>>2]|0;
     invoke_viii(53,($1070|0),($$byval_copy2|0),2);
     $1824 = __THREW__; __THREW__ = 0;
     $1825 = $1824&1;
     if ($1825) {
      label = 35;
      break;
     }
     $625 = $1038;
     $626 = $1070;
     $1826 = $625;
     $1827 = ((($1826)) + 4|0);
     $1828 = HEAP32[$1827>>2]|0;
     $624 = $1826;
     $1829 = $624;
     $1830 = ((($1829)) + 8|0);
     $623 = $1830;
     $1831 = $623;
     $622 = $1831;
     $1832 = $622;
     $1833 = HEAP32[$1832>>2]|0;
     $1834 = ($1828>>>0)<($1833>>>0);
     if ($1834) {
      __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotatorC2ERKS5_j($627,$1826,1);
      $621 = $1826;
      $1835 = $621;
      $1836 = ((($1835)) + 8|0);
      $620 = $1836;
      $1837 = $620;
      $619 = $1837;
      $1838 = $619;
      $1839 = ((($1826)) + 4|0);
      $1840 = HEAP32[$1839>>2]|0;
      $617 = $1840;
      $1841 = $617;
      $1842 = $626;
      $572 = $1842;
      $1843 = $572;
      $613 = $1838;
      $614 = $1841;
      $615 = $1843;
      $1844 = $613;
      $1845 = $614;
      $1846 = $615;
      $612 = $1846;
      $1847 = $612;
      ;HEAP8[$611>>0]=HEAP8[$616>>0]|0;
      $608 = $1844;
      $609 = $1845;
      $610 = $1847;
      $1848 = $608;
      $1849 = $609;
      $1850 = $610;
      $607 = $1850;
      $1851 = $607;
      $604 = $1848;
      $605 = $1849;
      $606 = $1851;
      $1852 = $605;
      $1853 = $606;
      $603 = $1853;
      $1854 = $603;
      $601 = $1852;
      $602 = $1854;
      $1855 = $601;
      $1856 = $602;
      $600 = $1856;
      $1857 = $600;
      $1858 = ((($1857)) + 8|0);
      $599 = $1858;
      $1859 = $599;
      $598 = $1859;
      $1860 = $598;
      $597 = $1860;
      $1861 = $597;
      $585 = $1855;
      $586 = $1861;
      $1862 = $585;
      $584 = $1862;
      HEAP32[$1862>>2] = 0;
      $1863 = ((($1862)) + 4|0);
      HEAP32[$1863>>2] = 0;
      $1864 = ((($1862)) + 8|0);
      ;HEAP8[$583>>0]=HEAP8[$587>>0]|0;
      $580 = $1864;
      HEAP32[$581>>2] = 0;
      $1865 = $580;
      $579 = $581;
      $1866 = $579;
      $1867 = HEAP32[$1866>>2]|0;
      $573 = $583;
      ;HEAP8[$578>>0]=HEAP8[$582>>0]|0;
      $576 = $1865;
      HEAP32[$577>>2] = $1867;
      $1868 = $576;
      $575 = $578;
      $574 = $577;
      $1869 = $574;
      $1870 = HEAP32[$1869>>2]|0;
      HEAP32[$1868>>2] = $1870;
      $1871 = $602;
      $1872 = HEAP32[$1871>>2]|0;
      HEAP32[$1855>>2] = $1872;
      $1873 = $602;
      $1874 = ((($1873)) + 4|0);
      $1875 = HEAP32[$1874>>2]|0;
      $1876 = ((($1855)) + 4|0);
      HEAP32[$1876>>2] = $1875;
      $1877 = $602;
      $590 = $1877;
      $1878 = $590;
      $1879 = ((($1878)) + 8|0);
      $589 = $1879;
      $1880 = $589;
      $588 = $1880;
      $1881 = $588;
      $1882 = HEAP32[$1881>>2]|0;
      $593 = $1855;
      $1883 = $593;
      $1884 = ((($1883)) + 8|0);
      $592 = $1884;
      $1885 = $592;
      $591 = $1885;
      $1886 = $591;
      HEAP32[$1886>>2] = $1882;
      $1887 = $602;
      $596 = $1887;
      $1888 = $596;
      $1889 = ((($1888)) + 8|0);
      $595 = $1889;
      $1890 = $595;
      $594 = $1890;
      $1891 = $594;
      HEAP32[$1891>>2] = 0;
      $1892 = $602;
      $1893 = ((($1892)) + 4|0);
      HEAP32[$1893>>2] = 0;
      $1894 = $602;
      HEAP32[$1894>>2] = 0;
      __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotator6__doneEv($627);
      $1895 = ((($1826)) + 4|0);
      $1896 = HEAP32[$1895>>2]|0;
      $1897 = ((($1896)) + 12|0);
      HEAP32[$1895>>2] = $1897;
     } else {
      $1898 = $626;
      $618 = $1898;
      $1899 = $618;
      __THREW__ = 0;
      invoke_vii(54,($1826|0),($1899|0));
      $1900 = __THREW__; __THREW__ = 0;
      $1901 = $1900&1;
      if ($1901) {
       label = 78;
       break;
      }
     }
     __ZNSt3__26vectorIiNS_9allocatorIiEEED2Ev($1070);
     $570 = 6672;
     $571 = 2;
     $1902 = $570;
     $1903 = HEAP32[$1902>>2]|0;
     $1904 = $571;
     $1905 = (($1903) + (($1904*12)|0)|0);
     $567 = $1039;
     $568 = $1905;
     $1906 = $567;
     $1907 = ((($1906)) + 4|0);
     $1908 = HEAP32[$1907>>2]|0;
     $566 = $1906;
     $1909 = $566;
     $1910 = ((($1909)) + 8|0);
     $565 = $1910;
     $1911 = $565;
     $564 = $1911;
     $1912 = $564;
     $1913 = HEAP32[$1912>>2]|0;
     $1914 = ($1908|0)!=($1913|0);
     if ($1914) {
      __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotatorC2ERKS5_j($569,$1906,1);
      $563 = $1906;
      $1915 = $563;
      $1916 = ((($1915)) + 8|0);
      $562 = $1916;
      $1917 = $562;
      $561 = $1917;
      $1918 = $561;
      $1919 = ((($1906)) + 4|0);
      $1920 = HEAP32[$1919>>2]|0;
      $560 = $1920;
      $1921 = $560;
      $1922 = $568;
      $556 = $1918;
      $557 = $1921;
      $558 = $1922;
      $1923 = $556;
      $1924 = $557;
      $1925 = $558;
      $555 = $1925;
      $1926 = $555;
      ;HEAP8[$554>>0]=HEAP8[$559>>0]|0;
      $551 = $1923;
      $552 = $1924;
      $553 = $1926;
      $1927 = $551;
      $1928 = $552;
      $1929 = $553;
      $550 = $1929;
      $1930 = $550;
      $547 = $1927;
      $548 = $1928;
      $549 = $1930;
      $1931 = $548;
      $1932 = $549;
      $546 = $1932;
      $1933 = $546;
      __THREW__ = 0;
      invoke_vii(55,($1931|0),($1933|0));
      $1934 = __THREW__; __THREW__ = 0;
      $1935 = $1934&1;
      if ($1935) {
       label = 35;
       break;
      }
      __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotator6__doneEv($569);
      $1936 = ((($1906)) + 4|0);
      $1937 = HEAP32[$1936>>2]|0;
      $1938 = ((($1937)) + 12|0);
      HEAP32[$1936>>2] = $1938;
     } else {
      $1939 = $568;
      __THREW__ = 0;
      invoke_vii(56,($1906|0),($1939|0));
      $1940 = __THREW__; __THREW__ = 0;
      $1941 = $1940&1;
      if ($1941) {
       label = 35;
       break;
      }
     }
     $1942 = ((($1057)) + 12|0);
     __THREW__ = 0;
     invoke_vii(57,($1073|0),($1942|0));
     $1943 = __THREW__; __THREW__ = 0;
     $1944 = $1943&1;
     if ($1944) {
      label = 35;
      break;
     }
     __THREW__ = 0;
     invoke_viii(58,($1072|0),($1073|0),2);
     $1945 = __THREW__; __THREW__ = 0;
     $1946 = $1945&1;
     if ($1946) {
      label = 79;
      break;
     }
     $543 = $1040;
     $544 = $1072;
     $1947 = $543;
     $1948 = ((($1947)) + 4|0);
     $1949 = HEAP32[$1948>>2]|0;
     $542 = $1947;
     $1950 = $542;
     $1951 = ((($1950)) + 8|0);
     $541 = $1951;
     $1952 = $541;
     $540 = $1952;
     $1953 = $540;
     $1954 = HEAP32[$1953>>2]|0;
     $1955 = ($1949>>>0)<($1954>>>0);
     if ($1955) {
      __ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE24__RAII_IncreaseAnnotatorC2ERKS5_j($545,$1947,1);
      $539 = $1947;
      $1956 = $539;
      $1957 = ((($1956)) + 8|0);
      $538 = $1957;
      $1958 = $538;
      $537 = $1958;
      $1959 = $537;
      $1960 = ((($1947)) + 4|0);
      $1961 = HEAP32[$1960>>2]|0;
      $535 = $1961;
      $1962 = $535;
      $1963 = $544;
      $490 = $1963;
      $1964 = $490;
      $531 = $1959;
      $532 = $1962;
      $533 = $1964;
      $1965 = $531;
      $1966 = $532;
      $1967 = $533;
      $530 = $1967;
      $1968 = $530;
      ;HEAP8[$529>>0]=HEAP8[$534>>0]|0;
      $526 = $1965;
      $527 = $1966;
      $528 = $1968;
      $1969 = $526;
      $1970 = $527;
      $1971 = $528;
      $525 = $1971;
      $1972 = $525;
      $522 = $1969;
      $523 = $1970;
      $524 = $1972;
      $1973 = $523;
      $1974 = $524;
      $521 = $1974;
      $1975 = $521;
      $519 = $1973;
      $520 = $1975;
      $1976 = $519;
      $1977 = $520;
      $518 = $1977;
      $1978 = $518;
      $1979 = ((($1978)) + 8|0);
      $517 = $1979;
      $1980 = $517;
      $516 = $1980;
      $1981 = $516;
      $515 = $1981;
      $1982 = $515;
      $503 = $1976;
      $504 = $1982;
      $1983 = $503;
      $502 = $1983;
      HEAP32[$1983>>2] = 0;
      $1984 = ((($1983)) + 4|0);
      HEAP32[$1984>>2] = 0;
      $1985 = ((($1983)) + 8|0);
      ;HEAP8[$501>>0]=HEAP8[$505>>0]|0;
      $498 = $1985;
      HEAP32[$499>>2] = 0;
      $1986 = $498;
      $497 = $499;
      $1987 = $497;
      $1988 = HEAP32[$1987>>2]|0;
      $491 = $501;
      ;HEAP8[$496>>0]=HEAP8[$500>>0]|0;
      $494 = $1986;
      HEAP32[$495>>2] = $1988;
      $1989 = $494;
      $493 = $496;
      $492 = $495;
      $1990 = $492;
      $1991 = HEAP32[$1990>>2]|0;
      HEAP32[$1989>>2] = $1991;
      $1992 = $520;
      $1993 = HEAP32[$1992>>2]|0;
      HEAP32[$1976>>2] = $1993;
      $1994 = $520;
      $1995 = ((($1994)) + 4|0);
      $1996 = HEAP32[$1995>>2]|0;
      $1997 = ((($1976)) + 4|0);
      HEAP32[$1997>>2] = $1996;
      $1998 = $520;
      $508 = $1998;
      $1999 = $508;
      $2000 = ((($1999)) + 8|0);
      $507 = $2000;
      $2001 = $507;
      $506 = $2001;
      $2002 = $506;
      $2003 = HEAP32[$2002>>2]|0;
      $511 = $1976;
      $2004 = $511;
      $2005 = ((($2004)) + 8|0);
      $510 = $2005;
      $2006 = $510;
      $509 = $2006;
      $2007 = $509;
      HEAP32[$2007>>2] = $2003;
      $2008 = $520;
      $514 = $2008;
      $2009 = $514;
      $2010 = ((($2009)) + 8|0);
      $513 = $2010;
      $2011 = $513;
      $512 = $2011;
      $2012 = $512;
      HEAP32[$2012>>2] = 0;
      $2013 = $520;
      $2014 = ((($2013)) + 4|0);
      HEAP32[$2014>>2] = 0;
      $2015 = $520;
      HEAP32[$2015>>2] = 0;
      __ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE24__RAII_IncreaseAnnotator6__doneEv($545);
      $2016 = ((($1947)) + 4|0);
      $2017 = HEAP32[$2016>>2]|0;
      $2018 = ((($2017)) + 12|0);
      HEAP32[$2016>>2] = $2018;
     } else {
      $2019 = $544;
      $536 = $2019;
      $2020 = $536;
      __THREW__ = 0;
      invoke_vii(59,($1947|0),($2020|0));
      $2021 = __THREW__; __THREW__ = 0;
      $2022 = $2021&1;
      if ($2022) {
       label = 80;
       break;
      }
     }
     __ZNSt3__26vectorIfNS_9allocatorIfEEED2Ev($1072);
     __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($1073);
    }
    $2029 = $1060;
    $2030 = (($2029) - 1)|0;
    $2031 = HEAP32[$1043>>2]|0;
    $2032 = ($2030|0)<($2031|0);
    if ($2032) {
     label = 85;
    } else {
     $2033 = $1033;
     $2034 = $1059;
     $2035 = $1060;
     $2036 = (($2035) - 1)|0;
     $2037 = $1061;
     __THREW__ = 0;
     $2038 = (invoke_iiiii(52,($2033|0),($2034|0),($2036|0),($2037|0))|0);
     $2039 = __THREW__; __THREW__ = 0;
     $2040 = $2039&1;
     if ($2040) {
      label = 35;
      break;
     }
     if ($2038) {
      label = 85;
     }
    }
    if ((label|0) == 85) {
     label = 0;
     ;HEAP32[$1075>>2]=HEAP32[$1058>>2]|0;HEAP32[$1075+4>>2]=HEAP32[$1058+4>>2]|0;HEAP32[$1075+8>>2]=HEAP32[$1058+8>>2]|0;
     __THREW__ = 0;
     ;HEAP32[$$byval_copy3>>2]=HEAP32[$1075>>2]|0;HEAP32[$$byval_copy3+4>>2]=HEAP32[$1075+4>>2]|0;HEAP32[$$byval_copy3+8>>2]=HEAP32[$1075+8>>2]|0;
     invoke_viii(53,($1074|0),($$byval_copy3|0),3);
     $2041 = __THREW__; __THREW__ = 0;
     $2042 = $2041&1;
     if ($2042) {
      label = 35;
      break;
     }
     $487 = $1038;
     $488 = $1074;
     $2043 = $487;
     $2044 = ((($2043)) + 4|0);
     $2045 = HEAP32[$2044>>2]|0;
     $486 = $2043;
     $2046 = $486;
     $2047 = ((($2046)) + 8|0);
     $485 = $2047;
     $2048 = $485;
     $484 = $2048;
     $2049 = $484;
     $2050 = HEAP32[$2049>>2]|0;
     $2051 = ($2045>>>0)<($2050>>>0);
     if ($2051) {
      __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotatorC2ERKS5_j($489,$2043,1);
      $483 = $2043;
      $2052 = $483;
      $2053 = ((($2052)) + 8|0);
      $482 = $2053;
      $2054 = $482;
      $481 = $2054;
      $2055 = $481;
      $2056 = ((($2043)) + 4|0);
      $2057 = HEAP32[$2056>>2]|0;
      $479 = $2057;
      $2058 = $479;
      $2059 = $488;
      $434 = $2059;
      $2060 = $434;
      $475 = $2055;
      $476 = $2058;
      $477 = $2060;
      $2061 = $475;
      $2062 = $476;
      $2063 = $477;
      $474 = $2063;
      $2064 = $474;
      ;HEAP8[$473>>0]=HEAP8[$478>>0]|0;
      $470 = $2061;
      $471 = $2062;
      $472 = $2064;
      $2065 = $470;
      $2066 = $471;
      $2067 = $472;
      $469 = $2067;
      $2068 = $469;
      $466 = $2065;
      $467 = $2066;
      $468 = $2068;
      $2069 = $467;
      $2070 = $468;
      $465 = $2070;
      $2071 = $465;
      $463 = $2069;
      $464 = $2071;
      $2072 = $463;
      $2073 = $464;
      $462 = $2073;
      $2074 = $462;
      $2075 = ((($2074)) + 8|0);
      $461 = $2075;
      $2076 = $461;
      $460 = $2076;
      $2077 = $460;
      $459 = $2077;
      $2078 = $459;
      $447 = $2072;
      $448 = $2078;
      $2079 = $447;
      $446 = $2079;
      HEAP32[$2079>>2] = 0;
      $2080 = ((($2079)) + 4|0);
      HEAP32[$2080>>2] = 0;
      $2081 = ((($2079)) + 8|0);
      ;HEAP8[$445>>0]=HEAP8[$449>>0]|0;
      $442 = $2081;
      HEAP32[$443>>2] = 0;
      $2082 = $442;
      $441 = $443;
      $2083 = $441;
      $2084 = HEAP32[$2083>>2]|0;
      $435 = $445;
      ;HEAP8[$440>>0]=HEAP8[$444>>0]|0;
      $438 = $2082;
      HEAP32[$439>>2] = $2084;
      $2085 = $438;
      $437 = $440;
      $436 = $439;
      $2086 = $436;
      $2087 = HEAP32[$2086>>2]|0;
      HEAP32[$2085>>2] = $2087;
      $2088 = $464;
      $2089 = HEAP32[$2088>>2]|0;
      HEAP32[$2072>>2] = $2089;
      $2090 = $464;
      $2091 = ((($2090)) + 4|0);
      $2092 = HEAP32[$2091>>2]|0;
      $2093 = ((($2072)) + 4|0);
      HEAP32[$2093>>2] = $2092;
      $2094 = $464;
      $452 = $2094;
      $2095 = $452;
      $2096 = ((($2095)) + 8|0);
      $451 = $2096;
      $2097 = $451;
      $450 = $2097;
      $2098 = $450;
      $2099 = HEAP32[$2098>>2]|0;
      $455 = $2072;
      $2100 = $455;
      $2101 = ((($2100)) + 8|0);
      $454 = $2101;
      $2102 = $454;
      $453 = $2102;
      $2103 = $453;
      HEAP32[$2103>>2] = $2099;
      $2104 = $464;
      $458 = $2104;
      $2105 = $458;
      $2106 = ((($2105)) + 8|0);
      $457 = $2106;
      $2107 = $457;
      $456 = $2107;
      $2108 = $456;
      HEAP32[$2108>>2] = 0;
      $2109 = $464;
      $2110 = ((($2109)) + 4|0);
      HEAP32[$2110>>2] = 0;
      $2111 = $464;
      HEAP32[$2111>>2] = 0;
      __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotator6__doneEv($489);
      $2112 = ((($2043)) + 4|0);
      $2113 = HEAP32[$2112>>2]|0;
      $2114 = ((($2113)) + 12|0);
      HEAP32[$2112>>2] = $2114;
     } else {
      $2115 = $488;
      $480 = $2115;
      $2116 = $480;
      __THREW__ = 0;
      invoke_vii(54,($2043|0),($2116|0));
      $2117 = __THREW__; __THREW__ = 0;
      $2118 = $2117&1;
      if ($2118) {
       label = 99;
       break;
      }
     }
     __ZNSt3__26vectorIiNS_9allocatorIiEEED2Ev($1074);
     $432 = 6672;
     $433 = 3;
     $2119 = $432;
     $2120 = HEAP32[$2119>>2]|0;
     $2121 = $433;
     $2122 = (($2120) + (($2121*12)|0)|0);
     $429 = $1039;
     $430 = $2122;
     $2123 = $429;
     $2124 = ((($2123)) + 4|0);
     $2125 = HEAP32[$2124>>2]|0;
     $428 = $2123;
     $2126 = $428;
     $2127 = ((($2126)) + 8|0);
     $427 = $2127;
     $2128 = $427;
     $426 = $2128;
     $2129 = $426;
     $2130 = HEAP32[$2129>>2]|0;
     $2131 = ($2125|0)!=($2130|0);
     if ($2131) {
      __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotatorC2ERKS5_j($431,$2123,1);
      $425 = $2123;
      $2132 = $425;
      $2133 = ((($2132)) + 8|0);
      $424 = $2133;
      $2134 = $424;
      $423 = $2134;
      $2135 = $423;
      $2136 = ((($2123)) + 4|0);
      $2137 = HEAP32[$2136>>2]|0;
      $422 = $2137;
      $2138 = $422;
      $2139 = $430;
      $418 = $2135;
      $419 = $2138;
      $420 = $2139;
      $2140 = $418;
      $2141 = $419;
      $2142 = $420;
      $417 = $2142;
      $2143 = $417;
      ;HEAP8[$416>>0]=HEAP8[$421>>0]|0;
      $413 = $2140;
      $414 = $2141;
      $415 = $2143;
      $2144 = $413;
      $2145 = $414;
      $2146 = $415;
      $412 = $2146;
      $2147 = $412;
      $409 = $2144;
      $410 = $2145;
      $411 = $2147;
      $2148 = $410;
      $2149 = $411;
      $408 = $2149;
      $2150 = $408;
      __THREW__ = 0;
      invoke_vii(55,($2148|0),($2150|0));
      $2151 = __THREW__; __THREW__ = 0;
      $2152 = $2151&1;
      if ($2152) {
       label = 35;
       break;
      }
      __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotator6__doneEv($431);
      $2153 = ((($2123)) + 4|0);
      $2154 = HEAP32[$2153>>2]|0;
      $2155 = ((($2154)) + 12|0);
      HEAP32[$2153>>2] = $2155;
     } else {
      $2156 = $430;
      __THREW__ = 0;
      invoke_vii(56,($2123|0),($2156|0));
      $2157 = __THREW__; __THREW__ = 0;
      $2158 = $2157&1;
      if ($2158) {
       label = 35;
       break;
      }
     }
     $2159 = ((($1057)) + 12|0);
     __THREW__ = 0;
     invoke_vii(57,($1077|0),($2159|0));
     $2160 = __THREW__; __THREW__ = 0;
     $2161 = $2160&1;
     if ($2161) {
      label = 35;
      break;
     }
     __THREW__ = 0;
     invoke_viii(58,($1076|0),($1077|0),3);
     $2162 = __THREW__; __THREW__ = 0;
     $2163 = $2162&1;
     if ($2163) {
      label = 100;
      break;
     }
     $405 = $1040;
     $406 = $1076;
     $2164 = $405;
     $2165 = ((($2164)) + 4|0);
     $2166 = HEAP32[$2165>>2]|0;
     $404 = $2164;
     $2167 = $404;
     $2168 = ((($2167)) + 8|0);
     $403 = $2168;
     $2169 = $403;
     $402 = $2169;
     $2170 = $402;
     $2171 = HEAP32[$2170>>2]|0;
     $2172 = ($2166>>>0)<($2171>>>0);
     if ($2172) {
      __ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE24__RAII_IncreaseAnnotatorC2ERKS5_j($407,$2164,1);
      $401 = $2164;
      $2173 = $401;
      $2174 = ((($2173)) + 8|0);
      $400 = $2174;
      $2175 = $400;
      $399 = $2175;
      $2176 = $399;
      $2177 = ((($2164)) + 4|0);
      $2178 = HEAP32[$2177>>2]|0;
      $397 = $2178;
      $2179 = $397;
      $2180 = $406;
      $352 = $2180;
      $2181 = $352;
      $393 = $2176;
      $394 = $2179;
      $395 = $2181;
      $2182 = $393;
      $2183 = $394;
      $2184 = $395;
      $392 = $2184;
      $2185 = $392;
      ;HEAP8[$391>>0]=HEAP8[$396>>0]|0;
      $388 = $2182;
      $389 = $2183;
      $390 = $2185;
      $2186 = $388;
      $2187 = $389;
      $2188 = $390;
      $387 = $2188;
      $2189 = $387;
      $384 = $2186;
      $385 = $2187;
      $386 = $2189;
      $2190 = $385;
      $2191 = $386;
      $383 = $2191;
      $2192 = $383;
      $381 = $2190;
      $382 = $2192;
      $2193 = $381;
      $2194 = $382;
      $380 = $2194;
      $2195 = $380;
      $2196 = ((($2195)) + 8|0);
      $379 = $2196;
      $2197 = $379;
      $378 = $2197;
      $2198 = $378;
      $377 = $2198;
      $2199 = $377;
      $365 = $2193;
      $366 = $2199;
      $2200 = $365;
      $364 = $2200;
      HEAP32[$2200>>2] = 0;
      $2201 = ((($2200)) + 4|0);
      HEAP32[$2201>>2] = 0;
      $2202 = ((($2200)) + 8|0);
      ;HEAP8[$363>>0]=HEAP8[$367>>0]|0;
      $360 = $2202;
      HEAP32[$361>>2] = 0;
      $2203 = $360;
      $359 = $361;
      $2204 = $359;
      $2205 = HEAP32[$2204>>2]|0;
      $353 = $363;
      ;HEAP8[$358>>0]=HEAP8[$362>>0]|0;
      $356 = $2203;
      HEAP32[$357>>2] = $2205;
      $2206 = $356;
      $355 = $358;
      $354 = $357;
      $2207 = $354;
      $2208 = HEAP32[$2207>>2]|0;
      HEAP32[$2206>>2] = $2208;
      $2209 = $382;
      $2210 = HEAP32[$2209>>2]|0;
      HEAP32[$2193>>2] = $2210;
      $2211 = $382;
      $2212 = ((($2211)) + 4|0);
      $2213 = HEAP32[$2212>>2]|0;
      $2214 = ((($2193)) + 4|0);
      HEAP32[$2214>>2] = $2213;
      $2215 = $382;
      $370 = $2215;
      $2216 = $370;
      $2217 = ((($2216)) + 8|0);
      $369 = $2217;
      $2218 = $369;
      $368 = $2218;
      $2219 = $368;
      $2220 = HEAP32[$2219>>2]|0;
      $373 = $2193;
      $2221 = $373;
      $2222 = ((($2221)) + 8|0);
      $372 = $2222;
      $2223 = $372;
      $371 = $2223;
      $2224 = $371;
      HEAP32[$2224>>2] = $2220;
      $2225 = $382;
      $376 = $2225;
      $2226 = $376;
      $2227 = ((($2226)) + 8|0);
      $375 = $2227;
      $2228 = $375;
      $374 = $2228;
      $2229 = $374;
      HEAP32[$2229>>2] = 0;
      $2230 = $382;
      $2231 = ((($2230)) + 4|0);
      HEAP32[$2231>>2] = 0;
      $2232 = $382;
      HEAP32[$2232>>2] = 0;
      __ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE24__RAII_IncreaseAnnotator6__doneEv($407);
      $2233 = ((($2164)) + 4|0);
      $2234 = HEAP32[$2233>>2]|0;
      $2235 = ((($2234)) + 12|0);
      HEAP32[$2233>>2] = $2235;
     } else {
      $2236 = $406;
      $398 = $2236;
      $2237 = $398;
      __THREW__ = 0;
      invoke_vii(59,($2164|0),($2237|0));
      $2238 = __THREW__; __THREW__ = 0;
      $2239 = $2238&1;
      if ($2239) {
       label = 101;
       break;
      }
     }
     __ZNSt3__26vectorIfNS_9allocatorIfEEED2Ev($1076);
     __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($1077);
    }
    $2246 = $1061;
    $2247 = (($2246) + 1)|0;
    $2248 = HEAP32[$1046>>2]|0;
    $2249 = ($2247|0)>($2248|0);
    if ($2249) {
     label = 106;
    } else {
     $2250 = $1033;
     $2251 = $1059;
     $2252 = $1060;
     $2253 = $1061;
     $2254 = (($2253) + 1)|0;
     __THREW__ = 0;
     $2255 = (invoke_iiiii(52,($2250|0),($2251|0),($2252|0),($2254|0))|0);
     $2256 = __THREW__; __THREW__ = 0;
     $2257 = $2256&1;
     if ($2257) {
      label = 35;
      break;
     }
     if ($2255) {
      label = 106;
     }
    }
    if ((label|0) == 106) {
     label = 0;
     ;HEAP32[$1079>>2]=HEAP32[$1058>>2]|0;HEAP32[$1079+4>>2]=HEAP32[$1058+4>>2]|0;HEAP32[$1079+8>>2]=HEAP32[$1058+8>>2]|0;
     __THREW__ = 0;
     ;HEAP32[$$byval_copy4>>2]=HEAP32[$1079>>2]|0;HEAP32[$$byval_copy4+4>>2]=HEAP32[$1079+4>>2]|0;HEAP32[$$byval_copy4+8>>2]=HEAP32[$1079+8>>2]|0;
     invoke_viii(53,($1078|0),($$byval_copy4|0),4);
     $2258 = __THREW__; __THREW__ = 0;
     $2259 = $2258&1;
     if ($2259) {
      label = 35;
      break;
     }
     $349 = $1038;
     $350 = $1078;
     $2260 = $349;
     $2261 = ((($2260)) + 4|0);
     $2262 = HEAP32[$2261>>2]|0;
     $348 = $2260;
     $2263 = $348;
     $2264 = ((($2263)) + 8|0);
     $347 = $2264;
     $2265 = $347;
     $346 = $2265;
     $2266 = $346;
     $2267 = HEAP32[$2266>>2]|0;
     $2268 = ($2262>>>0)<($2267>>>0);
     if ($2268) {
      __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotatorC2ERKS5_j($351,$2260,1);
      $345 = $2260;
      $2269 = $345;
      $2270 = ((($2269)) + 8|0);
      $344 = $2270;
      $2271 = $344;
      $343 = $2271;
      $2272 = $343;
      $2273 = ((($2260)) + 4|0);
      $2274 = HEAP32[$2273>>2]|0;
      $341 = $2274;
      $2275 = $341;
      $2276 = $350;
      $296 = $2276;
      $2277 = $296;
      $337 = $2272;
      $338 = $2275;
      $339 = $2277;
      $2278 = $337;
      $2279 = $338;
      $2280 = $339;
      $336 = $2280;
      $2281 = $336;
      ;HEAP8[$335>>0]=HEAP8[$340>>0]|0;
      $332 = $2278;
      $333 = $2279;
      $334 = $2281;
      $2282 = $332;
      $2283 = $333;
      $2284 = $334;
      $331 = $2284;
      $2285 = $331;
      $328 = $2282;
      $329 = $2283;
      $330 = $2285;
      $2286 = $329;
      $2287 = $330;
      $327 = $2287;
      $2288 = $327;
      $325 = $2286;
      $326 = $2288;
      $2289 = $325;
      $2290 = $326;
      $324 = $2290;
      $2291 = $324;
      $2292 = ((($2291)) + 8|0);
      $323 = $2292;
      $2293 = $323;
      $322 = $2293;
      $2294 = $322;
      $321 = $2294;
      $2295 = $321;
      $309 = $2289;
      $310 = $2295;
      $2296 = $309;
      $308 = $2296;
      HEAP32[$2296>>2] = 0;
      $2297 = ((($2296)) + 4|0);
      HEAP32[$2297>>2] = 0;
      $2298 = ((($2296)) + 8|0);
      ;HEAP8[$307>>0]=HEAP8[$311>>0]|0;
      $304 = $2298;
      HEAP32[$305>>2] = 0;
      $2299 = $304;
      $303 = $305;
      $2300 = $303;
      $2301 = HEAP32[$2300>>2]|0;
      $297 = $307;
      ;HEAP8[$302>>0]=HEAP8[$306>>0]|0;
      $300 = $2299;
      HEAP32[$301>>2] = $2301;
      $2302 = $300;
      $299 = $302;
      $298 = $301;
      $2303 = $298;
      $2304 = HEAP32[$2303>>2]|0;
      HEAP32[$2302>>2] = $2304;
      $2305 = $326;
      $2306 = HEAP32[$2305>>2]|0;
      HEAP32[$2289>>2] = $2306;
      $2307 = $326;
      $2308 = ((($2307)) + 4|0);
      $2309 = HEAP32[$2308>>2]|0;
      $2310 = ((($2289)) + 4|0);
      HEAP32[$2310>>2] = $2309;
      $2311 = $326;
      $314 = $2311;
      $2312 = $314;
      $2313 = ((($2312)) + 8|0);
      $313 = $2313;
      $2314 = $313;
      $312 = $2314;
      $2315 = $312;
      $2316 = HEAP32[$2315>>2]|0;
      $317 = $2289;
      $2317 = $317;
      $2318 = ((($2317)) + 8|0);
      $316 = $2318;
      $2319 = $316;
      $315 = $2319;
      $2320 = $315;
      HEAP32[$2320>>2] = $2316;
      $2321 = $326;
      $320 = $2321;
      $2322 = $320;
      $2323 = ((($2322)) + 8|0);
      $319 = $2323;
      $2324 = $319;
      $318 = $2324;
      $2325 = $318;
      HEAP32[$2325>>2] = 0;
      $2326 = $326;
      $2327 = ((($2326)) + 4|0);
      HEAP32[$2327>>2] = 0;
      $2328 = $326;
      HEAP32[$2328>>2] = 0;
      __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotator6__doneEv($351);
      $2329 = ((($2260)) + 4|0);
      $2330 = HEAP32[$2329>>2]|0;
      $2331 = ((($2330)) + 12|0);
      HEAP32[$2329>>2] = $2331;
     } else {
      $2332 = $350;
      $342 = $2332;
      $2333 = $342;
      __THREW__ = 0;
      invoke_vii(54,($2260|0),($2333|0));
      $2334 = __THREW__; __THREW__ = 0;
      $2335 = $2334&1;
      if ($2335) {
       label = 120;
       break;
      }
     }
     __ZNSt3__26vectorIiNS_9allocatorIiEEED2Ev($1078);
     $294 = 6672;
     $295 = 4;
     $2336 = $294;
     $2337 = HEAP32[$2336>>2]|0;
     $2338 = $295;
     $2339 = (($2337) + (($2338*12)|0)|0);
     $291 = $1039;
     $292 = $2339;
     $2340 = $291;
     $2341 = ((($2340)) + 4|0);
     $2342 = HEAP32[$2341>>2]|0;
     $290 = $2340;
     $2343 = $290;
     $2344 = ((($2343)) + 8|0);
     $289 = $2344;
     $2345 = $289;
     $288 = $2345;
     $2346 = $288;
     $2347 = HEAP32[$2346>>2]|0;
     $2348 = ($2342|0)!=($2347|0);
     if ($2348) {
      __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotatorC2ERKS5_j($293,$2340,1);
      $287 = $2340;
      $2349 = $287;
      $2350 = ((($2349)) + 8|0);
      $286 = $2350;
      $2351 = $286;
      $285 = $2351;
      $2352 = $285;
      $2353 = ((($2340)) + 4|0);
      $2354 = HEAP32[$2353>>2]|0;
      $284 = $2354;
      $2355 = $284;
      $2356 = $292;
      $280 = $2352;
      $281 = $2355;
      $282 = $2356;
      $2357 = $280;
      $2358 = $281;
      $2359 = $282;
      $279 = $2359;
      $2360 = $279;
      ;HEAP8[$278>>0]=HEAP8[$283>>0]|0;
      $275 = $2357;
      $276 = $2358;
      $277 = $2360;
      $2361 = $275;
      $2362 = $276;
      $2363 = $277;
      $274 = $2363;
      $2364 = $274;
      $271 = $2361;
      $272 = $2362;
      $273 = $2364;
      $2365 = $272;
      $2366 = $273;
      $270 = $2366;
      $2367 = $270;
      __THREW__ = 0;
      invoke_vii(55,($2365|0),($2367|0));
      $2368 = __THREW__; __THREW__ = 0;
      $2369 = $2368&1;
      if ($2369) {
       label = 35;
       break;
      }
      __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotator6__doneEv($293);
      $2370 = ((($2340)) + 4|0);
      $2371 = HEAP32[$2370>>2]|0;
      $2372 = ((($2371)) + 12|0);
      HEAP32[$2370>>2] = $2372;
     } else {
      $2373 = $292;
      __THREW__ = 0;
      invoke_vii(56,($2340|0),($2373|0));
      $2374 = __THREW__; __THREW__ = 0;
      $2375 = $2374&1;
      if ($2375) {
       label = 35;
       break;
      }
     }
     $2376 = ((($1057)) + 12|0);
     __THREW__ = 0;
     invoke_vii(57,($1081|0),($2376|0));
     $2377 = __THREW__; __THREW__ = 0;
     $2378 = $2377&1;
     if ($2378) {
      label = 35;
      break;
     }
     __THREW__ = 0;
     invoke_viii(58,($1080|0),($1081|0),4);
     $2379 = __THREW__; __THREW__ = 0;
     $2380 = $2379&1;
     if ($2380) {
      label = 121;
      break;
     }
     $267 = $1040;
     $268 = $1080;
     $2381 = $267;
     $2382 = ((($2381)) + 4|0);
     $2383 = HEAP32[$2382>>2]|0;
     $266 = $2381;
     $2384 = $266;
     $2385 = ((($2384)) + 8|0);
     $265 = $2385;
     $2386 = $265;
     $264 = $2386;
     $2387 = $264;
     $2388 = HEAP32[$2387>>2]|0;
     $2389 = ($2383>>>0)<($2388>>>0);
     if ($2389) {
      __ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE24__RAII_IncreaseAnnotatorC2ERKS5_j($269,$2381,1);
      $263 = $2381;
      $2390 = $263;
      $2391 = ((($2390)) + 8|0);
      $262 = $2391;
      $2392 = $262;
      $261 = $2392;
      $2393 = $261;
      $2394 = ((($2381)) + 4|0);
      $2395 = HEAP32[$2394>>2]|0;
      $259 = $2395;
      $2396 = $259;
      $2397 = $268;
      $214 = $2397;
      $2398 = $214;
      $255 = $2393;
      $256 = $2396;
      $257 = $2398;
      $2399 = $255;
      $2400 = $256;
      $2401 = $257;
      $254 = $2401;
      $2402 = $254;
      ;HEAP8[$253>>0]=HEAP8[$258>>0]|0;
      $250 = $2399;
      $251 = $2400;
      $252 = $2402;
      $2403 = $250;
      $2404 = $251;
      $2405 = $252;
      $249 = $2405;
      $2406 = $249;
      $246 = $2403;
      $247 = $2404;
      $248 = $2406;
      $2407 = $247;
      $2408 = $248;
      $245 = $2408;
      $2409 = $245;
      $243 = $2407;
      $244 = $2409;
      $2410 = $243;
      $2411 = $244;
      $242 = $2411;
      $2412 = $242;
      $2413 = ((($2412)) + 8|0);
      $241 = $2413;
      $2414 = $241;
      $240 = $2414;
      $2415 = $240;
      $239 = $2415;
      $2416 = $239;
      $227 = $2410;
      $228 = $2416;
      $2417 = $227;
      $226 = $2417;
      HEAP32[$2417>>2] = 0;
      $2418 = ((($2417)) + 4|0);
      HEAP32[$2418>>2] = 0;
      $2419 = ((($2417)) + 8|0);
      ;HEAP8[$225>>0]=HEAP8[$229>>0]|0;
      $222 = $2419;
      HEAP32[$223>>2] = 0;
      $2420 = $222;
      $221 = $223;
      $2421 = $221;
      $2422 = HEAP32[$2421>>2]|0;
      $215 = $225;
      ;HEAP8[$220>>0]=HEAP8[$224>>0]|0;
      $218 = $2420;
      HEAP32[$219>>2] = $2422;
      $2423 = $218;
      $217 = $220;
      $216 = $219;
      $2424 = $216;
      $2425 = HEAP32[$2424>>2]|0;
      HEAP32[$2423>>2] = $2425;
      $2426 = $244;
      $2427 = HEAP32[$2426>>2]|0;
      HEAP32[$2410>>2] = $2427;
      $2428 = $244;
      $2429 = ((($2428)) + 4|0);
      $2430 = HEAP32[$2429>>2]|0;
      $2431 = ((($2410)) + 4|0);
      HEAP32[$2431>>2] = $2430;
      $2432 = $244;
      $232 = $2432;
      $2433 = $232;
      $2434 = ((($2433)) + 8|0);
      $231 = $2434;
      $2435 = $231;
      $230 = $2435;
      $2436 = $230;
      $2437 = HEAP32[$2436>>2]|0;
      $235 = $2410;
      $2438 = $235;
      $2439 = ((($2438)) + 8|0);
      $234 = $2439;
      $2440 = $234;
      $233 = $2440;
      $2441 = $233;
      HEAP32[$2441>>2] = $2437;
      $2442 = $244;
      $238 = $2442;
      $2443 = $238;
      $2444 = ((($2443)) + 8|0);
      $237 = $2444;
      $2445 = $237;
      $236 = $2445;
      $2446 = $236;
      HEAP32[$2446>>2] = 0;
      $2447 = $244;
      $2448 = ((($2447)) + 4|0);
      HEAP32[$2448>>2] = 0;
      $2449 = $244;
      HEAP32[$2449>>2] = 0;
      __ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE24__RAII_IncreaseAnnotator6__doneEv($269);
      $2450 = ((($2381)) + 4|0);
      $2451 = HEAP32[$2450>>2]|0;
      $2452 = ((($2451)) + 12|0);
      HEAP32[$2450>>2] = $2452;
     } else {
      $2453 = $268;
      $260 = $2453;
      $2454 = $260;
      __THREW__ = 0;
      invoke_vii(59,($2381|0),($2454|0));
      $2455 = __THREW__; __THREW__ = 0;
      $2456 = $2455&1;
      if ($2456) {
       label = 122;
       break;
      }
     }
     __ZNSt3__26vectorIfNS_9allocatorIfEEED2Ev($1080);
     __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($1081);
    }
    $2463 = $1061;
    $2464 = (($2463) - 1)|0;
    $2465 = HEAP32[$1043>>2]|0;
    $2466 = ($2464|0)<($2465|0);
    if ($2466) {
     label = 127;
    } else {
     $2467 = $1033;
     $2468 = $1059;
     $2469 = $1060;
     $2470 = $1061;
     $2471 = (($2470) - 1)|0;
     __THREW__ = 0;
     $2472 = (invoke_iiiii(52,($2467|0),($2468|0),($2469|0),($2471|0))|0);
     $2473 = __THREW__; __THREW__ = 0;
     $2474 = $2473&1;
     if ($2474) {
      label = 35;
      break;
     }
     if ($2472) {
      label = 127;
     }
    }
    if ((label|0) == 127) {
     label = 0;
     ;HEAP32[$1083>>2]=HEAP32[$1058>>2]|0;HEAP32[$1083+4>>2]=HEAP32[$1058+4>>2]|0;HEAP32[$1083+8>>2]=HEAP32[$1058+8>>2]|0;
     __THREW__ = 0;
     ;HEAP32[$$byval_copy5>>2]=HEAP32[$1083>>2]|0;HEAP32[$$byval_copy5+4>>2]=HEAP32[$1083+4>>2]|0;HEAP32[$$byval_copy5+8>>2]=HEAP32[$1083+8>>2]|0;
     invoke_viii(53,($1082|0),($$byval_copy5|0),5);
     $2475 = __THREW__; __THREW__ = 0;
     $2476 = $2475&1;
     if ($2476) {
      label = 35;
      break;
     }
     $211 = $1038;
     $212 = $1082;
     $2477 = $211;
     $2478 = ((($2477)) + 4|0);
     $2479 = HEAP32[$2478>>2]|0;
     $210 = $2477;
     $2480 = $210;
     $2481 = ((($2480)) + 8|0);
     $209 = $2481;
     $2482 = $209;
     $208 = $2482;
     $2483 = $208;
     $2484 = HEAP32[$2483>>2]|0;
     $2485 = ($2479>>>0)<($2484>>>0);
     if ($2485) {
      __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotatorC2ERKS5_j($213,$2477,1);
      $207 = $2477;
      $2486 = $207;
      $2487 = ((($2486)) + 8|0);
      $206 = $2487;
      $2488 = $206;
      $205 = $2488;
      $2489 = $205;
      $2490 = ((($2477)) + 4|0);
      $2491 = HEAP32[$2490>>2]|0;
      $203 = $2491;
      $2492 = $203;
      $2493 = $212;
      $158 = $2493;
      $2494 = $158;
      $199 = $2489;
      $200 = $2492;
      $201 = $2494;
      $2495 = $199;
      $2496 = $200;
      $2497 = $201;
      $198 = $2497;
      $2498 = $198;
      ;HEAP8[$197>>0]=HEAP8[$202>>0]|0;
      $194 = $2495;
      $195 = $2496;
      $196 = $2498;
      $2499 = $194;
      $2500 = $195;
      $2501 = $196;
      $193 = $2501;
      $2502 = $193;
      $190 = $2499;
      $191 = $2500;
      $192 = $2502;
      $2503 = $191;
      $2504 = $192;
      $189 = $2504;
      $2505 = $189;
      $187 = $2503;
      $188 = $2505;
      $2506 = $187;
      $2507 = $188;
      $186 = $2507;
      $2508 = $186;
      $2509 = ((($2508)) + 8|0);
      $185 = $2509;
      $2510 = $185;
      $184 = $2510;
      $2511 = $184;
      $183 = $2511;
      $2512 = $183;
      $171 = $2506;
      $172 = $2512;
      $2513 = $171;
      $170 = $2513;
      HEAP32[$2513>>2] = 0;
      $2514 = ((($2513)) + 4|0);
      HEAP32[$2514>>2] = 0;
      $2515 = ((($2513)) + 8|0);
      ;HEAP8[$169>>0]=HEAP8[$173>>0]|0;
      $166 = $2515;
      HEAP32[$167>>2] = 0;
      $2516 = $166;
      $165 = $167;
      $2517 = $165;
      $2518 = HEAP32[$2517>>2]|0;
      $159 = $169;
      ;HEAP8[$164>>0]=HEAP8[$168>>0]|0;
      $162 = $2516;
      HEAP32[$163>>2] = $2518;
      $2519 = $162;
      $161 = $164;
      $160 = $163;
      $2520 = $160;
      $2521 = HEAP32[$2520>>2]|0;
      HEAP32[$2519>>2] = $2521;
      $2522 = $188;
      $2523 = HEAP32[$2522>>2]|0;
      HEAP32[$2506>>2] = $2523;
      $2524 = $188;
      $2525 = ((($2524)) + 4|0);
      $2526 = HEAP32[$2525>>2]|0;
      $2527 = ((($2506)) + 4|0);
      HEAP32[$2527>>2] = $2526;
      $2528 = $188;
      $176 = $2528;
      $2529 = $176;
      $2530 = ((($2529)) + 8|0);
      $175 = $2530;
      $2531 = $175;
      $174 = $2531;
      $2532 = $174;
      $2533 = HEAP32[$2532>>2]|0;
      $179 = $2506;
      $2534 = $179;
      $2535 = ((($2534)) + 8|0);
      $178 = $2535;
      $2536 = $178;
      $177 = $2536;
      $2537 = $177;
      HEAP32[$2537>>2] = $2533;
      $2538 = $188;
      $182 = $2538;
      $2539 = $182;
      $2540 = ((($2539)) + 8|0);
      $181 = $2540;
      $2541 = $181;
      $180 = $2541;
      $2542 = $180;
      HEAP32[$2542>>2] = 0;
      $2543 = $188;
      $2544 = ((($2543)) + 4|0);
      HEAP32[$2544>>2] = 0;
      $2545 = $188;
      HEAP32[$2545>>2] = 0;
      __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotator6__doneEv($213);
      $2546 = ((($2477)) + 4|0);
      $2547 = HEAP32[$2546>>2]|0;
      $2548 = ((($2547)) + 12|0);
      HEAP32[$2546>>2] = $2548;
     } else {
      $2549 = $212;
      $204 = $2549;
      $2550 = $204;
      __THREW__ = 0;
      invoke_vii(54,($2477|0),($2550|0));
      $2551 = __THREW__; __THREW__ = 0;
      $2552 = $2551&1;
      if ($2552) {
       label = 141;
       break;
      }
     }
     __ZNSt3__26vectorIiNS_9allocatorIiEEED2Ev($1082);
     $156 = 6672;
     $157 = 5;
     $2553 = $156;
     $2554 = HEAP32[$2553>>2]|0;
     $2555 = $157;
     $2556 = (($2554) + (($2555*12)|0)|0);
     $153 = $1039;
     $154 = $2556;
     $2557 = $153;
     $2558 = ((($2557)) + 4|0);
     $2559 = HEAP32[$2558>>2]|0;
     $152 = $2557;
     $2560 = $152;
     $2561 = ((($2560)) + 8|0);
     $151 = $2561;
     $2562 = $151;
     $150 = $2562;
     $2563 = $150;
     $2564 = HEAP32[$2563>>2]|0;
     $2565 = ($2559|0)!=($2564|0);
     if ($2565) {
      __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotatorC2ERKS5_j($155,$2557,1);
      $149 = $2557;
      $2566 = $149;
      $2567 = ((($2566)) + 8|0);
      $148 = $2567;
      $2568 = $148;
      $147 = $2568;
      $2569 = $147;
      $2570 = ((($2557)) + 4|0);
      $2571 = HEAP32[$2570>>2]|0;
      $146 = $2571;
      $2572 = $146;
      $2573 = $154;
      $142 = $2569;
      $143 = $2572;
      $144 = $2573;
      $2574 = $142;
      $2575 = $143;
      $2576 = $144;
      $141 = $2576;
      $2577 = $141;
      ;HEAP8[$140>>0]=HEAP8[$145>>0]|0;
      $137 = $2574;
      $138 = $2575;
      $139 = $2577;
      $2578 = $137;
      $2579 = $138;
      $2580 = $139;
      $136 = $2580;
      $2581 = $136;
      $133 = $2578;
      $134 = $2579;
      $135 = $2581;
      $2582 = $134;
      $2583 = $135;
      $132 = $2583;
      $2584 = $132;
      __THREW__ = 0;
      invoke_vii(55,($2582|0),($2584|0));
      $2585 = __THREW__; __THREW__ = 0;
      $2586 = $2585&1;
      if ($2586) {
       label = 35;
       break;
      }
      __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotator6__doneEv($155);
      $2587 = ((($2557)) + 4|0);
      $2588 = HEAP32[$2587>>2]|0;
      $2589 = ((($2588)) + 12|0);
      HEAP32[$2587>>2] = $2589;
     } else {
      $2590 = $154;
      __THREW__ = 0;
      invoke_vii(56,($2557|0),($2590|0));
      $2591 = __THREW__; __THREW__ = 0;
      $2592 = $2591&1;
      if ($2592) {
       label = 35;
       break;
      }
     }
     $2593 = ((($1057)) + 12|0);
     __THREW__ = 0;
     invoke_vii(57,($1085|0),($2593|0));
     $2594 = __THREW__; __THREW__ = 0;
     $2595 = $2594&1;
     if ($2595) {
      label = 35;
      break;
     }
     __THREW__ = 0;
     invoke_viii(58,($1084|0),($1085|0),5);
     $2596 = __THREW__; __THREW__ = 0;
     $2597 = $2596&1;
     if ($2597) {
      label = 142;
      break;
     }
     $129 = $1040;
     $130 = $1084;
     $2598 = $129;
     $2599 = ((($2598)) + 4|0);
     $2600 = HEAP32[$2599>>2]|0;
     $128 = $2598;
     $2601 = $128;
     $2602 = ((($2601)) + 8|0);
     $127 = $2602;
     $2603 = $127;
     $126 = $2603;
     $2604 = $126;
     $2605 = HEAP32[$2604>>2]|0;
     $2606 = ($2600>>>0)<($2605>>>0);
     if ($2606) {
      __ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE24__RAII_IncreaseAnnotatorC2ERKS5_j($131,$2598,1);
      $125 = $2598;
      $2607 = $125;
      $2608 = ((($2607)) + 8|0);
      $124 = $2608;
      $2609 = $124;
      $123 = $2609;
      $2610 = $123;
      $2611 = ((($2598)) + 4|0);
      $2612 = HEAP32[$2611>>2]|0;
      $121 = $2612;
      $2613 = $121;
      $2614 = $130;
      $76 = $2614;
      $2615 = $76;
      $117 = $2610;
      $118 = $2613;
      $119 = $2615;
      $2616 = $117;
      $2617 = $118;
      $2618 = $119;
      $116 = $2618;
      $2619 = $116;
      ;HEAP8[$115>>0]=HEAP8[$120>>0]|0;
      $112 = $2616;
      $113 = $2617;
      $114 = $2619;
      $2620 = $112;
      $2621 = $113;
      $2622 = $114;
      $111 = $2622;
      $2623 = $111;
      $108 = $2620;
      $109 = $2621;
      $110 = $2623;
      $2624 = $109;
      $2625 = $110;
      $107 = $2625;
      $2626 = $107;
      $105 = $2624;
      $106 = $2626;
      $2627 = $105;
      $2628 = $106;
      $104 = $2628;
      $2629 = $104;
      $2630 = ((($2629)) + 8|0);
      $103 = $2630;
      $2631 = $103;
      $102 = $2631;
      $2632 = $102;
      $101 = $2632;
      $2633 = $101;
      $89 = $2627;
      $90 = $2633;
      $2634 = $89;
      $88 = $2634;
      HEAP32[$2634>>2] = 0;
      $2635 = ((($2634)) + 4|0);
      HEAP32[$2635>>2] = 0;
      $2636 = ((($2634)) + 8|0);
      ;HEAP8[$87>>0]=HEAP8[$91>>0]|0;
      $84 = $2636;
      HEAP32[$85>>2] = 0;
      $2637 = $84;
      $83 = $85;
      $2638 = $83;
      $2639 = HEAP32[$2638>>2]|0;
      $77 = $87;
      ;HEAP8[$82>>0]=HEAP8[$86>>0]|0;
      $80 = $2637;
      HEAP32[$81>>2] = $2639;
      $2640 = $80;
      $79 = $82;
      $78 = $81;
      $2641 = $78;
      $2642 = HEAP32[$2641>>2]|0;
      HEAP32[$2640>>2] = $2642;
      $2643 = $106;
      $2644 = HEAP32[$2643>>2]|0;
      HEAP32[$2627>>2] = $2644;
      $2645 = $106;
      $2646 = ((($2645)) + 4|0);
      $2647 = HEAP32[$2646>>2]|0;
      $2648 = ((($2627)) + 4|0);
      HEAP32[$2648>>2] = $2647;
      $2649 = $106;
      $94 = $2649;
      $2650 = $94;
      $2651 = ((($2650)) + 8|0);
      $93 = $2651;
      $2652 = $93;
      $92 = $2652;
      $2653 = $92;
      $2654 = HEAP32[$2653>>2]|0;
      $97 = $2627;
      $2655 = $97;
      $2656 = ((($2655)) + 8|0);
      $96 = $2656;
      $2657 = $96;
      $95 = $2657;
      $2658 = $95;
      HEAP32[$2658>>2] = $2654;
      $2659 = $106;
      $100 = $2659;
      $2660 = $100;
      $2661 = ((($2660)) + 8|0);
      $99 = $2661;
      $2662 = $99;
      $98 = $2662;
      $2663 = $98;
      HEAP32[$2663>>2] = 0;
      $2664 = $106;
      $2665 = ((($2664)) + 4|0);
      HEAP32[$2665>>2] = 0;
      $2666 = $106;
      HEAP32[$2666>>2] = 0;
      __ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE24__RAII_IncreaseAnnotator6__doneEv($131);
      $2667 = ((($2598)) + 4|0);
      $2668 = HEAP32[$2667>>2]|0;
      $2669 = ((($2668)) + 12|0);
      HEAP32[$2667>>2] = $2669;
     } else {
      $2670 = $130;
      $122 = $2670;
      $2671 = $122;
      __THREW__ = 0;
      invoke_vii(59,($2598|0),($2671|0));
      $2672 = __THREW__; __THREW__ = 0;
      $2673 = $2672&1;
      if ($2673) {
       label = 143;
       break;
      }
     }
     __ZNSt3__26vectorIfNS_9allocatorIfEEED2Ev($1084);
     __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($1085);
    }
    __ZN5BlockD2Ev($1057);
    $75 = $1055;
    $2680 = $75;
    $2681 = HEAP32[$2680>>2]|0;
    $2682 = ((($2681)) + 24|0);
    HEAP32[$2680>>2] = $2682;
   }
   switch (label|0) {
    case 35: {
     $1587 = ___cxa_find_matching_catch_2()|0;
     $1588 = tempRet0;
     $1051 = $1587;
     $1052 = $1588;
     break;
    }
    case 36: {
     $1589 = ___cxa_find_matching_catch_2()|0;
     $1590 = tempRet0;
     $1051 = $1589;
     $1052 = $1590;
     __ZNSt3__26vectorIiNS_9allocatorIiEEED2Ev($1062);
     break;
    }
    case 37: {
     $1591 = ___cxa_find_matching_catch_2()|0;
     $1592 = tempRet0;
     $1051 = $1591;
     $1052 = $1592;
     label = 39;
     break;
    }
    case 38: {
     $1593 = ___cxa_find_matching_catch_2()|0;
     $1594 = tempRet0;
     $1051 = $1593;
     $1052 = $1594;
     __ZNSt3__26vectorIfNS_9allocatorIfEEED2Ev($1064);
     label = 39;
     break;
    }
    case 57: {
     $1806 = ___cxa_find_matching_catch_2()|0;
     $1807 = tempRet0;
     $1051 = $1806;
     $1052 = $1807;
     __ZNSt3__26vectorIiNS_9allocatorIiEEED2Ev($1066);
     break;
    }
    case 58: {
     $1808 = ___cxa_find_matching_catch_2()|0;
     $1809 = tempRet0;
     $1051 = $1808;
     $1052 = $1809;
     label = 60;
     break;
    }
    case 59: {
     $1810 = ___cxa_find_matching_catch_2()|0;
     $1811 = tempRet0;
     $1051 = $1810;
     $1052 = $1811;
     __ZNSt3__26vectorIfNS_9allocatorIfEEED2Ev($1068);
     label = 60;
     break;
    }
    case 78: {
     $2023 = ___cxa_find_matching_catch_2()|0;
     $2024 = tempRet0;
     $1051 = $2023;
     $1052 = $2024;
     __ZNSt3__26vectorIiNS_9allocatorIiEEED2Ev($1070);
     break;
    }
    case 79: {
     $2025 = ___cxa_find_matching_catch_2()|0;
     $2026 = tempRet0;
     $1051 = $2025;
     $1052 = $2026;
     label = 81;
     break;
    }
    case 80: {
     $2027 = ___cxa_find_matching_catch_2()|0;
     $2028 = tempRet0;
     $1051 = $2027;
     $1052 = $2028;
     __ZNSt3__26vectorIfNS_9allocatorIfEEED2Ev($1072);
     label = 81;
     break;
    }
    case 99: {
     $2240 = ___cxa_find_matching_catch_2()|0;
     $2241 = tempRet0;
     $1051 = $2240;
     $1052 = $2241;
     __ZNSt3__26vectorIiNS_9allocatorIiEEED2Ev($1074);
     break;
    }
    case 100: {
     $2242 = ___cxa_find_matching_catch_2()|0;
     $2243 = tempRet0;
     $1051 = $2242;
     $1052 = $2243;
     label = 102;
     break;
    }
    case 101: {
     $2244 = ___cxa_find_matching_catch_2()|0;
     $2245 = tempRet0;
     $1051 = $2244;
     $1052 = $2245;
     __ZNSt3__26vectorIfNS_9allocatorIfEEED2Ev($1076);
     label = 102;
     break;
    }
    case 120: {
     $2457 = ___cxa_find_matching_catch_2()|0;
     $2458 = tempRet0;
     $1051 = $2457;
     $1052 = $2458;
     __ZNSt3__26vectorIiNS_9allocatorIiEEED2Ev($1078);
     break;
    }
    case 121: {
     $2459 = ___cxa_find_matching_catch_2()|0;
     $2460 = tempRet0;
     $1051 = $2459;
     $1052 = $2460;
     label = 123;
     break;
    }
    case 122: {
     $2461 = ___cxa_find_matching_catch_2()|0;
     $2462 = tempRet0;
     $1051 = $2461;
     $1052 = $2462;
     __ZNSt3__26vectorIfNS_9allocatorIfEEED2Ev($1080);
     label = 123;
     break;
    }
    case 141: {
     $2674 = ___cxa_find_matching_catch_2()|0;
     $2675 = tempRet0;
     $1051 = $2674;
     $1052 = $2675;
     __ZNSt3__26vectorIiNS_9allocatorIiEEED2Ev($1082);
     break;
    }
    case 142: {
     $2676 = ___cxa_find_matching_catch_2()|0;
     $2677 = tempRet0;
     $1051 = $2676;
     $1052 = $2677;
     label = 144;
     break;
    }
    case 143: {
     $2678 = ___cxa_find_matching_catch_2()|0;
     $2679 = tempRet0;
     $1051 = $2678;
     $1052 = $2679;
     __ZNSt3__26vectorIfNS_9allocatorIfEEED2Ev($1084);
     label = 144;
     break;
    }
    case 147: {
     $74 = $1038;
     $2683 = $74;
     $2684 = ((($2683)) + 4|0);
     $2685 = HEAP32[$2684>>2]|0;
     $2686 = HEAP32[$2683>>2]|0;
     $2687 = $2685;
     $2688 = $2686;
     $2689 = (($2687) - ($2688))|0;
     $2690 = (($2689|0) / 12)&-1;
     HEAP32[$1086>>2] = $2690;
     $$expand_i1_val = 0;
     HEAP8[$1087>>0] = $$expand_i1_val;
     __THREW__ = 0;
     $2691 = (invoke_ii(60,(6768|0))|0);
     $2692 = __THREW__; __THREW__ = 0;
     $2693 = $2692&1;
     if ($2693) {
      break L17;
     }
     HEAP32[$1032>>2] = $2691;
     $2694 = HEAP32[$1086>>2]|0;
     $2695 = $2694<<2;
     $2696 = ($2695*3)|0;
     HEAP32[$1089>>2] = $2696;
     __THREW__ = 0;
     $2697 = (invoke_iii(61,(6772|0),($1089|0))|0);
     $2698 = __THREW__; __THREW__ = 0;
     $2699 = $2698&1;
     if ($2699) {
      $2764 = ___cxa_find_matching_catch_2()|0;
      $2765 = tempRet0;
      $1051 = $2764;
      $1052 = $2765;
     } else {
      HEAP32[$1088>>2] = $2697;
      $2700 = HEAP32[$1086>>2]|0;
      $2701 = $2700<<2;
      $2702 = ($2701*3)|0;
      HEAP32[$1091>>2] = $2702;
      __THREW__ = 0;
      $2703 = (invoke_iii(61,(6772|0),($1091|0))|0);
      $2704 = __THREW__; __THREW__ = 0;
      $2705 = $2704&1;
      if ($2705) {
       $2766 = ___cxa_find_matching_catch_2()|0;
       $2767 = tempRet0;
       $1051 = $2766;
       $1052 = $2767;
      } else {
       HEAP32[$1090>>2] = $2703;
       $2706 = HEAP32[$1086>>2]|0;
       $2707 = $2706<<2;
       $2708 = $2707<<1;
       HEAP32[$1093>>2] = $2708;
       __THREW__ = 0;
       $2709 = (invoke_iii(61,(6772|0),($1093|0))|0);
       $2710 = __THREW__; __THREW__ = 0;
       $2711 = $2710&1;
       if ($2711) {
        $2768 = ___cxa_find_matching_catch_2()|0;
        $2769 = tempRet0;
        $1051 = $2768;
        $1052 = $2769;
       } else {
        HEAP32[$1092>>2] = $2709;
        HEAP32[$1094>>2] = 0;
        HEAP32[$1095>>2] = 0;
        HEAP32[$1096>>2] = 0;
        $1097 = 0;
        L167: while(1) {
         $2712 = $1097;
         $73 = $1038;
         $2713 = $73;
         $2714 = ((($2713)) + 4|0);
         $2715 = HEAP32[$2714>>2]|0;
         $2716 = HEAP32[$2713>>2]|0;
         $2717 = $2715;
         $2718 = $2716;
         $2719 = (($2717) - ($2718))|0;
         $2720 = (($2719|0) / 12)&-1;
         $2721 = ($2712>>>0)<($2720>>>0);
         if (!($2721)) {
          label = 173;
          break;
         }
         $2722 = $1097;
         $71 = $1038;
         $72 = $2722;
         $2723 = $71;
         $2724 = HEAP32[$2723>>2]|0;
         $2725 = $72;
         $2726 = (($2724) + (($2725*12)|0)|0);
         $1098 = $2726;
         $2727 = $1098;
         $70 = $2727;
         $2728 = $70;
         $2729 = HEAP32[$2728>>2]|0;
         $67 = $2728;
         $68 = $2729;
         $2730 = $68;
         $64 = $66;
         $65 = $2730;
         $2731 = $64;
         $2732 = $65;
         HEAP32[$2731>>2] = $2732;
         $2733 = HEAP32[$66>>2]|0;
         HEAP32[$69>>2] = $2733;
         $2734 = HEAP32[$69>>2]|0;
         HEAP32[$1099>>2] = $2734;
         $2735 = $1098;
         $63 = $2735;
         $2736 = $63;
         $2737 = ((($2736)) + 4|0);
         $2738 = HEAP32[$2737>>2]|0;
         $60 = $2736;
         $61 = $2738;
         $2739 = $61;
         $57 = $59;
         $58 = $2739;
         $2740 = $57;
         $2741 = $58;
         HEAP32[$2740>>2] = $2741;
         $2742 = HEAP32[$59>>2]|0;
         HEAP32[$62>>2] = $2742;
         $2743 = HEAP32[$62>>2]|0;
         HEAP32[$1100>>2] = $2743;
         while(1) {
          $55 = $1099;
          $56 = $1100;
          $2744 = $55;
          $2745 = $56;
          $53 = $2744;
          $54 = $2745;
          $2746 = $53;
          $52 = $2746;
          $2747 = $52;
          $2748 = HEAP32[$2747>>2]|0;
          $2749 = $54;
          $51 = $2749;
          $2750 = $51;
          $2751 = HEAP32[$2750>>2]|0;
          $2752 = ($2748|0)==($2751|0);
          $2753 = $2752 ^ 1;
          if (!($2753)) {
           break;
          }
          $50 = $1099;
          $2754 = $50;
          $2755 = HEAP32[$2754>>2]|0;
          $2756 = HEAP32[$2755>>2]|0;
          HEAP32[$1101>>2] = $2756;
          __THREW__ = 0;
          invoke_viii(62,($1088|0),($1094|0),($1101|0));
          $2757 = __THREW__; __THREW__ = 0;
          $2758 = $2757&1;
          if ($2758) {
           label = 160;
           break L167;
          }
          $2759 = HEAP32[$1094>>2]|0;
          $2760 = (($2759) + 1)|0;
          HEAP32[$1094>>2] = $2760;
          $49 = $1099;
          $2761 = $49;
          $2762 = HEAP32[$2761>>2]|0;
          $2763 = ((($2762)) + 4|0);
          HEAP32[$2761>>2] = $2763;
         }
         $1102 = 0;
         while(1) {
          $2772 = $1102;
          $2773 = ($2772|0)<(4);
          $2774 = $1097;
          if (!($2773)) {
           break;
          }
          $47 = $1039;
          $48 = $2774;
          $2775 = $47;
          $2776 = HEAP32[$2775>>2]|0;
          $2777 = $48;
          $2778 = (($2776) + (($2777*12)|0)|0);
          $1103 = $2778;
          $2779 = $1103;
          $46 = $2779;
          $2780 = $46;
          $2781 = HEAP32[$2780>>2]|0;
          $43 = $2780;
          $44 = $2781;
          $2782 = $44;
          $40 = $42;
          $41 = $2782;
          $2783 = $40;
          $2784 = $41;
          HEAP32[$2783>>2] = $2784;
          $2785 = HEAP32[$42>>2]|0;
          HEAP32[$45>>2] = $2785;
          $2786 = HEAP32[$45>>2]|0;
          HEAP32[$1104>>2] = $2786;
          $2787 = $1103;
          $39 = $2787;
          $2788 = $39;
          $2789 = ((($2788)) + 4|0);
          $2790 = HEAP32[$2789>>2]|0;
          $36 = $2788;
          $37 = $2790;
          $2791 = $37;
          $33 = $35;
          $34 = $2791;
          $2792 = $33;
          $2793 = $34;
          HEAP32[$2792>>2] = $2793;
          $2794 = HEAP32[$35>>2]|0;
          HEAP32[$38>>2] = $2794;
          $2795 = HEAP32[$38>>2]|0;
          HEAP32[$1105>>2] = $2795;
          while(1) {
           $31 = $1104;
           $32 = $1105;
           $2796 = $31;
           $2797 = $32;
           $29 = $2796;
           $30 = $2797;
           $2798 = $29;
           $28 = $2798;
           $2799 = $28;
           $2800 = HEAP32[$2799>>2]|0;
           $2801 = $30;
           $27 = $2801;
           $2802 = $27;
           $2803 = HEAP32[$2802>>2]|0;
           $2804 = ($2800|0)==($2803|0);
           $2805 = $2804 ^ 1;
           if (!($2805)) {
            break;
           }
           $26 = $1104;
           $2806 = $26;
           $2807 = HEAP32[$2806>>2]|0;
           $2808 = HEAP32[$2807>>2]|0;
           HEAP32[$1106>>2] = $2808;
           __THREW__ = 0;
           invoke_viii(62,($1090|0),($1095|0),($1106|0));
           $2809 = __THREW__; __THREW__ = 0;
           $2810 = $2809&1;
           if ($2810) {
            label = 160;
            break L167;
           }
           $2811 = HEAP32[$1095>>2]|0;
           $2812 = (($2811) + 1)|0;
           HEAP32[$1095>>2] = $2812;
           $25 = $1104;
           $2813 = $25;
           $2814 = HEAP32[$2813>>2]|0;
           $2815 = ((($2814)) + 4|0);
           HEAP32[$2813>>2] = $2815;
          }
          $2816 = $1102;
          $2817 = (($2816) + 1)|0;
          $1102 = $2817;
         }
         $23 = $1040;
         $24 = $2774;
         $2818 = $23;
         $2819 = HEAP32[$2818>>2]|0;
         $2820 = $24;
         $2821 = (($2819) + (($2820*12)|0)|0);
         $1107 = $2821;
         $2822 = $1107;
         $22 = $2822;
         $2823 = $22;
         $2824 = HEAP32[$2823>>2]|0;
         $19 = $2823;
         $20 = $2824;
         $2825 = $20;
         $16 = $18;
         $17 = $2825;
         $2826 = $16;
         $2827 = $17;
         HEAP32[$2826>>2] = $2827;
         $2828 = HEAP32[$18>>2]|0;
         HEAP32[$21>>2] = $2828;
         $2829 = HEAP32[$21>>2]|0;
         HEAP32[$1108>>2] = $2829;
         $2830 = $1107;
         $15 = $2830;
         $2831 = $15;
         $2832 = ((($2831)) + 4|0);
         $2833 = HEAP32[$2832>>2]|0;
         $12 = $2831;
         $13 = $2833;
         $2834 = $13;
         $9 = $11;
         $10 = $2834;
         $2835 = $9;
         $2836 = $10;
         HEAP32[$2835>>2] = $2836;
         $2837 = HEAP32[$11>>2]|0;
         HEAP32[$14>>2] = $2837;
         $2838 = HEAP32[$14>>2]|0;
         HEAP32[$1109>>2] = $2838;
         while(1) {
          $7 = $1108;
          $8 = $1109;
          $2839 = $7;
          $2840 = $8;
          $5 = $2839;
          $6 = $2840;
          $2841 = $5;
          $4 = $2841;
          $2842 = $4;
          $2843 = HEAP32[$2842>>2]|0;
          $2844 = $6;
          $3 = $2844;
          $2845 = $3;
          $2846 = HEAP32[$2845>>2]|0;
          $2847 = ($2843|0)==($2846|0);
          $2848 = $2847 ^ 1;
          if (!($2848)) {
           break;
          }
          $2 = $1108;
          $2849 = $2;
          $2850 = HEAP32[$2849>>2]|0;
          $2851 = +HEAPF32[$2850>>2];
          HEAPF32[$1110>>2] = $2851;
          __THREW__ = 0;
          invoke_viii(63,($1092|0),($1096|0),($1110|0));
          $2852 = __THREW__; __THREW__ = 0;
          $2853 = $2852&1;
          if ($2853) {
           label = 160;
           break L167;
          }
          $2854 = HEAP32[$1096>>2]|0;
          $2855 = (($2854) + 1)|0;
          HEAP32[$1096>>2] = $2855;
          $1 = $1108;
          $2856 = $1;
          $2857 = HEAP32[$2856>>2]|0;
          $2858 = ((($2857)) + 4|0);
          HEAP32[$2856>>2] = $2858;
         }
         $2859 = $1097;
         $2860 = (($2859) + 1)|0;
         $1097 = $2860;
        }
        if ((label|0) == 173) {
         $2861 = HEAP32[$1086>>2]|0;
         $2862 = ($2861*6)|0;
         HEAP32[$1112>>2] = $2862;
         __THREW__ = 0;
         $2863 = (invoke_iii(61,(6776|0),($1112|0))|0);
         $2864 = __THREW__; __THREW__ = 0;
         $2865 = $2864&1;
         if ($2865) {
          label = 160;
         } else {
          HEAP32[$1111>>2] = $2863;
          $1113 = 0;
          while(1) {
           $2866 = $1113;
           $2867 = HEAP32[$1095>>2]|0;
           $2868 = ($2866|0)<($2867|0);
           if (!($2868)) {
            label = 184;
            break;
           }
           $2869 = $1113;
           $2870 = $2869<<2;
           $1114 = $2870;
           $2871 = $1113;
           $2872 = ($2871*6)|0;
           HEAP32[$1115>>2] = $2872;
           $2873 = $1114;
           $2874 = (0 + ($2873))|0;
           HEAP32[$1116>>2] = $2874;
           __THREW__ = 0;
           invoke_viii(62,($1111|0),($1115|0),($1116|0));
           $2875 = __THREW__; __THREW__ = 0;
           $2876 = $2875&1;
           if ($2876) {
            break;
           }
           $2877 = $1113;
           $2878 = ($2877*6)|0;
           $2879 = (($2878) + 1)|0;
           HEAP32[$1117>>2] = $2879;
           $2880 = $1114;
           $2881 = (1 + ($2880))|0;
           HEAP32[$1118>>2] = $2881;
           __THREW__ = 0;
           invoke_viii(62,($1111|0),($1117|0),($1118|0));
           $2882 = __THREW__; __THREW__ = 0;
           $2883 = $2882&1;
           if ($2883) {
            break;
           }
           $2884 = $1113;
           $2885 = ($2884*6)|0;
           $2886 = (($2885) + 2)|0;
           HEAP32[$1119>>2] = $2886;
           $2887 = $1114;
           $2888 = (2 + ($2887))|0;
           HEAP32[$1120>>2] = $2888;
           __THREW__ = 0;
           invoke_viii(62,($1111|0),($1119|0),($1120|0));
           $2889 = __THREW__; __THREW__ = 0;
           $2890 = $2889&1;
           if ($2890) {
            break;
           }
           $2891 = $1113;
           $2892 = ($2891*6)|0;
           $2893 = (($2892) + 3)|0;
           HEAP32[$1121>>2] = $2893;
           $2894 = $1114;
           $2895 = (0 + ($2894))|0;
           HEAP32[$1122>>2] = $2895;
           __THREW__ = 0;
           invoke_viii(62,($1111|0),($1121|0),($1122|0));
           $2896 = __THREW__; __THREW__ = 0;
           $2897 = $2896&1;
           if ($2897) {
            break;
           }
           $2898 = $1113;
           $2899 = ($2898*6)|0;
           $2900 = (($2899) + 4)|0;
           HEAP32[$1123>>2] = $2900;
           $2901 = $1114;
           $2902 = (2 + ($2901))|0;
           HEAP32[$1124>>2] = $2902;
           __THREW__ = 0;
           invoke_viii(62,($1111|0),($1123|0),($1124|0));
           $2903 = __THREW__; __THREW__ = 0;
           $2904 = $2903&1;
           if ($2904) {
            break;
           }
           $2905 = $1113;
           $2906 = ($2905*6)|0;
           $2907 = (($2906) + 5)|0;
           HEAP32[$1125>>2] = $2907;
           $2908 = $1114;
           $2909 = (3 + ($2908))|0;
           HEAP32[$1126>>2] = $2909;
           __THREW__ = 0;
           invoke_viii(62,($1111|0),($1125|0),($1126|0));
           $2910 = __THREW__; __THREW__ = 0;
           $2911 = $2910&1;
           if ($2911) {
            break;
           }
           $2912 = $1113;
           $2913 = (($2912) + 1)|0;
           $1113 = $2913;
          }
          if ((label|0) == 184) {
           HEAP32[$1127>>2] = 0;
           __THREW__ = 0;
           invoke_viii(62,($1032|0),($1127|0),($1086|0));
           $2916 = __THREW__; __THREW__ = 0;
           $2917 = $2916&1;
           if (!($2917)) {
            HEAP32[$1128>>2] = 1;
            __THREW__ = 0;
            invoke_viii(64,($1032|0),($1128|0),($1088|0));
            $2918 = __THREW__; __THREW__ = 0;
            $2919 = $2918&1;
            if (!($2919)) {
             HEAP32[$1129>>2] = 2;
             __THREW__ = 0;
             invoke_viii(64,($1032|0),($1129|0),($1090|0));
             $2920 = __THREW__; __THREW__ = 0;
             $2921 = $2920&1;
             if (!($2921)) {
              HEAP32[$1130>>2] = 3;
              __THREW__ = 0;
              invoke_viii(64,($1032|0),($1130|0),($1092|0));
              $2922 = __THREW__; __THREW__ = 0;
              $2923 = $2922&1;
              if (!($2923)) {
               HEAP32[$1131>>2] = 4;
               __THREW__ = 0;
               invoke_viii(64,($1032|0),($1131|0),($1111|0));
               $2924 = __THREW__; __THREW__ = 0;
               $2925 = $2924&1;
               if (!($2925)) {
                $1132 = 0;
                while(1) {
                 $2926 = $1132;
                 $2927 = ($2926|0)<(20);
                 if (!($2927)) {
                  break;
                 }
                 $1133 = 0;
                 while(1) {
                  $2928 = $1133;
                  $2929 = ($2928|0)<(20);
                  $2930 = $1033;
                  $2931 = $1132;
                  $2932 = (($2930) + ($2931<<2)|0);
                  $2933 = HEAP32[$2932>>2]|0;
                  if (!($2929)) {
                   break;
                  }
                  $2934 = $1133;
                  $2935 = (($2933) + ($2934<<2)|0);
                  $2936 = HEAP32[$2935>>2]|0;
                  $2937 = ($2936|0)==(0|0);
                  if (!($2937)) {
                   __ZdaPv($2936);
                  }
                  $2938 = $1133;
                  $2939 = (($2938) + 1)|0;
                  $1133 = $2939;
                 }
                 $2940 = ($2933|0)==(0|0);
                 if (!($2940)) {
                  __ZdaPv($2933);
                 }
                 $2941 = $1132;
                 $2942 = (($2941) + 1)|0;
                 $1132 = $2942;
                }
                $2943 = $1033;
                $2944 = ($2943|0)==(0|0);
                if (!($2944)) {
                 __ZdaPv($2943);
                }
                $$expand_i1_val7 = 1;
                HEAP8[$1087>>0] = $$expand_i1_val7;
                __ZN10emscripten3valD2Ev($1111);
                __ZN10emscripten3valD2Ev($1092);
                __ZN10emscripten3valD2Ev($1090);
                __ZN10emscripten3valD2Ev($1088);
                $$pre_trunc = HEAP8[$1087>>0]|0;
                $2945 = $$pre_trunc&1;
                if ($2945) {
                 __ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEED2Ev($1040);
                 __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEED2Ev($1039);
                 __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEED2Ev($1038);
                 $2946 = HEAP32[$1032>>2]|0;
                 STACKTOP = sp;return ($2946|0);
                }
                __ZN10emscripten3valD2Ev($1032);
                __ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEED2Ev($1040);
                __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEED2Ev($1039);
                __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEED2Ev($1038);
                $2946 = HEAP32[$1032>>2]|0;
                STACKTOP = sp;return ($2946|0);
               }
              }
             }
            }
           }
          }
          $2914 = ___cxa_find_matching_catch_2()|0;
          $2915 = tempRet0;
          $1051 = $2914;
          $1052 = $2915;
          __ZN10emscripten3valD2Ev($1111);
         }
        }
        if ((label|0) == 160) {
         $2770 = ___cxa_find_matching_catch_2()|0;
         $2771 = tempRet0;
         $1051 = $2770;
         $1052 = $2771;
        }
        __ZN10emscripten3valD2Ev($1092);
       }
       __ZN10emscripten3valD2Ev($1090);
      }
      __ZN10emscripten3valD2Ev($1088);
     }
     __ZN10emscripten3valD2Ev($1032);
     __ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEED2Ev($1040);
     __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEED2Ev($1039);
     __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEED2Ev($1038);
     $2947 = $1051;
     $2948 = $1052;
     ___resumeException($2947|0);
     // unreachable;
     break;
    }
   }
   if ((label|0) == 39) {
    __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($1065);
   }
   else if ((label|0) == 60) {
    __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($1069);
   }
   else if ((label|0) == 81) {
    __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($1073);
   }
   else if ((label|0) == 102) {
    __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($1077);
   }
   else if ((label|0) == 123) {
    __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($1081);
   }
   else if ((label|0) == 144) {
    __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($1085);
   }
   __ZN5BlockD2Ev($1057);
   __ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEED2Ev($1040);
   __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEED2Ev($1039);
   __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEED2Ev($1038);
   $2947 = $1051;
   $2948 = $1052;
   ___resumeException($2947|0);
   // unreachable;
  }
 } while(0);
 $1338 = ___cxa_find_matching_catch_2()|0;
 $1339 = tempRet0;
 $1051 = $1338;
 $1052 = $1339;
 __ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEED2Ev($1040);
 __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEED2Ev($1039);
 __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEED2Ev($1038);
 $2947 = $1051;
 $2948 = $1052;
 ___resumeException($2947|0);
 // unreachable;
 return (0)|0;
}
function __ZNKSt3__26vectorI5BlockNS_9allocatorIS1_EEE4sizeEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = HEAP32[$2>>2]|0;
 $6 = $4;
 $7 = $5;
 $8 = (($6) - ($7))|0;
 $9 = (($8|0) / 24)&-1;
 STACKTOP = sp;return ($9|0);
}
function __ZN5BlockC2ERKS_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 ;HEAP32[$4>>2]=HEAP32[$5>>2]|0;HEAP32[$4+4>>2]=HEAP32[$5+4>>2]|0;HEAP32[$4+8>>2]=HEAP32[$5+8>>2]|0;
 $6 = ((($4)) + 12|0);
 $7 = $3;
 $8 = ((($7)) + 12|0);
 __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEC2ERKS5_($6,$8);
 STACKTOP = sp;return;
}
function __ZN5BlockD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 12|0);
 __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($3);
 STACKTOP = sp;return;
}
function __ZNK10emscripten3val4new_IJEEES0_DpOT_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp + 4|0;
 $2 = $0;
 $3 = $2;
 $4 = (__ZNK10emscripten3val12internalCallIPFPNS_8internal7_EM_VALES4_jPKPKvS6_EJEEES0_T_DpOT0_($3,65)|0);
 HEAP32[$1>>2] = $4;
 $5 = HEAP32[$1>>2]|0;
 STACKTOP = sp;return ($5|0);
}
function __ZNK10emscripten3val4new_IJiEEES0_DpOT_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = sp + 8|0;
 $4 = $0;
 $5 = $1;
 $6 = $4;
 $7 = $5;
 $2 = $7;
 $8 = $2;
 $9 = (__ZNK10emscripten3val12internalCallIPFPNS_8internal7_EM_VALES4_jPKPKvS6_EJiEEES0_T_DpOT0_($6,65,$8)|0);
 HEAP32[$3>>2] = $9;
 $10 = HEAP32[$3>>2]|0;
 STACKTOP = sp;return ($10|0);
}
function __ZN10emscripten3val3setIiiEEvRKT_RKT0_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $6 = sp + 12|0;
 $7 = sp + 8|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $10 = $3;
 $11 = HEAP32[$10>>2]|0;
 $12 = $4;
 __ZN10emscripten3valC2IRKiEEOT_($6,$12);
 $13 = HEAP32[$6>>2]|0;
 $14 = $5;
 __THREW__ = 0;
 invoke_vii(66,($7|0),($14|0));
 $15 = __THREW__; __THREW__ = 0;
 $16 = $15&1;
 if ($16) {
  $20 = ___cxa_find_matching_catch_2()|0;
  $21 = tempRet0;
  $8 = $20;
  $9 = $21;
  __ZN10emscripten3valD2Ev($6);
  $24 = $8;
  $25 = $9;
  ___resumeException($24|0);
  // unreachable;
 }
 $17 = HEAP32[$7>>2]|0;
 __THREW__ = 0;
 invoke_viii(67,($11|0),($13|0),($17|0));
 $18 = __THREW__; __THREW__ = 0;
 $19 = $18&1;
 if (!($19)) {
  __ZN10emscripten3valD2Ev($7);
  __ZN10emscripten3valD2Ev($6);
  STACKTOP = sp;return;
 }
 $22 = ___cxa_find_matching_catch_2()|0;
 $23 = tempRet0;
 $8 = $22;
 $9 = $23;
 __ZN10emscripten3valD2Ev($7);
 __ZN10emscripten3valD2Ev($6);
 $24 = $8;
 $25 = $9;
 ___resumeException($24|0);
 // unreachable;
}
function __ZN10emscripten3val3setIifEEvRKT_RKT0_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $6 = sp + 12|0;
 $7 = sp + 8|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $10 = $3;
 $11 = HEAP32[$10>>2]|0;
 $12 = $4;
 __ZN10emscripten3valC2IRKiEEOT_($6,$12);
 $13 = HEAP32[$6>>2]|0;
 $14 = $5;
 __THREW__ = 0;
 invoke_vii(68,($7|0),($14|0));
 $15 = __THREW__; __THREW__ = 0;
 $16 = $15&1;
 if ($16) {
  $20 = ___cxa_find_matching_catch_2()|0;
  $21 = tempRet0;
  $8 = $20;
  $9 = $21;
  __ZN10emscripten3valD2Ev($6);
  $24 = $8;
  $25 = $9;
  ___resumeException($24|0);
  // unreachable;
 }
 $17 = HEAP32[$7>>2]|0;
 __THREW__ = 0;
 invoke_viii(67,($11|0),($13|0),($17|0));
 $18 = __THREW__; __THREW__ = 0;
 $19 = $18&1;
 if (!($19)) {
  __ZN10emscripten3valD2Ev($7);
  __ZN10emscripten3valD2Ev($6);
  STACKTOP = sp;return;
 }
 $22 = ___cxa_find_matching_catch_2()|0;
 $23 = tempRet0;
 $8 = $22;
 $9 = $23;
 __ZN10emscripten3valD2Ev($7);
 __ZN10emscripten3valD2Ev($6);
 $24 = $8;
 $25 = $9;
 ___resumeException($24|0);
 // unreachable;
}
function __ZN10emscripten3val3setIiEEvRKT_RKS0_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $6 = sp + 8|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $9 = $3;
 $10 = HEAP32[$9>>2]|0;
 $11 = $4;
 __ZN10emscripten3valC2IRKiEEOT_($6,$11);
 $12 = HEAP32[$6>>2]|0;
 $13 = $5;
 $14 = HEAP32[$13>>2]|0;
 __THREW__ = 0;
 invoke_viii(67,($10|0),($12|0),($14|0));
 $15 = __THREW__; __THREW__ = 0;
 $16 = $15&1;
 if ($16) {
  $17 = ___cxa_find_matching_catch_2()|0;
  $18 = tempRet0;
  $7 = $17;
  $8 = $18;
  __ZN10emscripten3valD2Ev($6);
  $19 = $7;
  $20 = $8;
  ___resumeException($19|0);
  // unreachable;
 } else {
  __ZN10emscripten3valD2Ev($6);
  STACKTOP = sp;return;
 }
}
function ___cxx_global_var_init_25() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN38EmscriptenBindingInitializer_my_moduleC2Ev(7364);
 return;
}
function __ZN38EmscriptenBindingInitializer_my_moduleC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $3 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = sp + 14|0;
 $5 = sp + 13|0;
 $6 = sp + 12|0;
 $1 = $0;
 __ZN10emscripten11value_arrayI4Vec3EC2EPKc($2,1692);
 __THREW__ = 0;
 $7 = (invoke_iii(69,($2|0),0)|0);
 $8 = __THREW__; __THREW__ = 0;
 $9 = $8&1;
 if (!($9)) {
  __THREW__ = 0;
  $10 = (invoke_iii(69,($7|0),4)|0);
  $11 = __THREW__; __THREW__ = 0;
  $12 = $11&1;
  if (!($12)) {
   __THREW__ = 0;
   (invoke_iii(69,($10|0),8)|0);
   $13 = __THREW__; __THREW__ = 0;
   $14 = $13&1;
   if (!($14)) {
    __ZN10emscripten11value_arrayI4Vec3ED2Ev($2);
    __ZN10emscripten12value_objectI5BlockEC2EPKc($5,1697);
    __THREW__ = 0;
    $15 = (invoke_iiii(70,($5|0),(1703|0),0)|0);
    $16 = __THREW__; __THREW__ = 0;
    $17 = $16&1;
    if (!($17)) {
     __THREW__ = 0;
     (invoke_iiii(71,($15|0),(1712|0),12)|0);
     $18 = __THREW__; __THREW__ = 0;
     $19 = $18&1;
     if (!($19)) {
      __ZN10emscripten12value_objectI5BlockED2Ev($5);
      __ZN10emscripten15register_vectorI5BlockEENS_6class_INSt3__26vectorIT_NS3_9allocatorIS5_EEEENS_8internal11NoBaseClassEEEPKc($6,1717);
      __ZN10emscripten8functionINS_3valEJNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEEJEEEvPKcPFT_DpT0_EDpT1_(1729,72);
      STACKTOP = sp;return;
     }
    }
    $22 = ___cxa_find_matching_catch_2()|0;
    $23 = tempRet0;
    $3 = $22;
    $4 = $23;
    __ZN10emscripten12value_objectI5BlockED2Ev($5);
    $24 = $3;
    $25 = $4;
    ___resumeException($24|0);
    // unreachable;
   }
  }
 }
 $20 = ___cxa_find_matching_catch_2()|0;
 $21 = tempRet0;
 $3 = $20;
 $4 = $21;
 __ZN10emscripten11value_arrayI4Vec3ED2Ev($2);
 $24 = $3;
 $25 = $4;
 ___resumeException($24|0);
 // unreachable;
}
function __ZN10emscripten11value_arrayI4Vec3EC2EPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $3 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $10 = $4;
 __ZN10emscripten8internal11noncopyableC2Ev($10);
 $6 = 73;
 $7 = 74;
 __THREW__ = 0;
 $11 = (invoke_i(75)|0);
 $12 = __THREW__; __THREW__ = 0;
 $13 = $12&1;
 if (!($13)) {
  $14 = $5;
  $15 = $6;
  $3 = $15;
  $16 = (__ZN10emscripten8internal19getGenericSignatureIJiEEEPKcv()|0);
  $17 = $6;
  $18 = $7;
  $2 = $18;
  $19 = (__ZN10emscripten8internal19getGenericSignatureIJviEEEPKcv()|0);
  $20 = $7;
  __THREW__ = 0;
  invoke_viiiiii(76,($11|0),($14|0),($16|0),($17|0),($19|0),($20|0));
  $21 = __THREW__; __THREW__ = 0;
  $22 = $21&1;
  if (!($22)) {
   STACKTOP = sp;return;
  }
 }
 $23 = ___cxa_find_matching_catch_2()|0;
 $24 = tempRet0;
 $8 = $23;
 $9 = $24;
 __ZN10emscripten8internal11noncopyableD2Ev($10);
 $25 = $8;
 $26 = $9;
 ___resumeException($25|0);
 // unreachable;
}
function __ZN10emscripten11value_arrayI4Vec3E7elementIS1_iEERS2_MT_T0_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = sp + 8|0;
 $4 = $0;
 HEAP32[$5>>2] = $1;
 $8 = $4;
 $6 = 77;
 $7 = 78;
 $9 = (__ZN10emscripten8internal6TypeIDI4Vec3E3getEv()|0);
 $10 = (__ZN10emscripten8internal6TypeIDIiE3getEv()|0);
 $11 = $6;
 $3 = $11;
 $12 = (__ZN10emscripten8internal19getGenericSignatureIJiiiEEEPKcv()|0);
 $13 = $6;
 $14 = (__ZN10emscripten8internal10getContextIM4Vec3iEEPT_RKS4_($5)|0);
 $15 = (__ZN10emscripten8internal6TypeIDIiE3getEv()|0);
 $16 = $7;
 $2 = $16;
 $17 = (__ZN10emscripten8internal19getGenericSignatureIJviiiEEEPKcv()|0);
 $18 = $7;
 $19 = (__ZN10emscripten8internal10getContextIM4Vec3iEEPT_RKS4_($5)|0);
 __embind_register_value_array_element(($9|0),($10|0),($12|0),($13|0),($14|0),($15|0),($17|0),($18|0),($19|0));
 STACKTOP = sp;return ($8|0);
}
function __ZN10emscripten11value_arrayI4Vec3ED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $4 = $1;
 __THREW__ = 0;
 $5 = (invoke_i(75)|0);
 $6 = __THREW__; __THREW__ = 0;
 $7 = $6&1;
 if (!($7)) {
  __THREW__ = 0;
  invoke_vi(79,($5|0));
  $8 = __THREW__; __THREW__ = 0;
  $9 = $8&1;
  if (!($9)) {
   __ZN10emscripten8internal11noncopyableD2Ev($4);
   STACKTOP = sp;return;
  }
 }
 $10 = ___cxa_find_matching_catch_3(0|0)|0;
 $11 = tempRet0;
 $2 = $10;
 $3 = $11;
 __ZN10emscripten8internal11noncopyableD2Ev($4);
 $12 = $2;
 ___clang_call_terminate($12);
 // unreachable;
}
function __ZN10emscripten12value_objectI5BlockEC2EPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $3 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $10 = $4;
 __ZN10emscripten8internal11noncopyableC2Ev($10);
 $6 = 80;
 $7 = 81;
 __THREW__ = 0;
 $11 = (invoke_i(82)|0);
 $12 = __THREW__; __THREW__ = 0;
 $13 = $12&1;
 if (!($13)) {
  $14 = $5;
  $15 = $6;
  $3 = $15;
  $16 = (__ZN10emscripten8internal19getGenericSignatureIJiEEEPKcv()|0);
  $17 = $6;
  $18 = $7;
  $2 = $18;
  $19 = (__ZN10emscripten8internal19getGenericSignatureIJviEEEPKcv()|0);
  $20 = $7;
  __THREW__ = 0;
  invoke_viiiiii(83,($11|0),($14|0),($16|0),($17|0),($19|0),($20|0));
  $21 = __THREW__; __THREW__ = 0;
  $22 = $21&1;
  if (!($22)) {
   STACKTOP = sp;return;
  }
 }
 $23 = ___cxa_find_matching_catch_2()|0;
 $24 = tempRet0;
 $8 = $23;
 $9 = $24;
 __ZN10emscripten8internal11noncopyableD2Ev($10);
 $25 = $8;
 $26 = $9;
 ___resumeException($25|0);
 // unreachable;
}
function __ZN10emscripten12value_objectI5BlockE5fieldIS1_4Vec3EERS2_PKcMT_T0_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $7 = sp + 8|0;
 $5 = $0;
 $6 = $1;
 HEAP32[$7>>2] = $2;
 $10 = $5;
 $8 = 84;
 $9 = 85;
 $11 = (__ZN10emscripten8internal6TypeIDI5BlockE3getEv()|0);
 $12 = $6;
 $13 = (__ZN10emscripten8internal6TypeIDI4Vec3E3getEv()|0);
 $14 = $8;
 $4 = $14;
 $15 = (__ZN10emscripten8internal19getGenericSignatureIJiiiEEEPKcv()|0);
 $16 = $8;
 $17 = (__ZN10emscripten8internal10getContextIM5Block4Vec3EEPT_RKS5_($7)|0);
 $18 = (__ZN10emscripten8internal6TypeIDI4Vec3E3getEv()|0);
 $19 = $9;
 $3 = $19;
 $20 = (__ZN10emscripten8internal19getGenericSignatureIJviiiEEEPKcv()|0);
 $21 = $9;
 $22 = (__ZN10emscripten8internal10getContextIM5Block4Vec3EEPT_RKS5_($7)|0);
 __embind_register_value_object_field(($11|0),($12|0),($13|0),($15|0),($16|0),($17|0),($18|0),($20|0),($21|0),($22|0));
 STACKTOP = sp;return ($10|0);
}
function __ZN10emscripten12value_objectI5BlockE5fieldIS1_NSt3__212basic_stringIcNS4_11char_traitsIcEENS4_9allocatorIcEEEEEERS2_PKcMT_T0_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $7 = sp + 8|0;
 $5 = $0;
 $6 = $1;
 HEAP32[$7>>2] = $2;
 $10 = $5;
 $8 = 86;
 $9 = 87;
 $11 = (__ZN10emscripten8internal6TypeIDI5BlockE3getEv()|0);
 $12 = $6;
 $13 = (__ZN10emscripten8internal6TypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE3getEv()|0);
 $14 = $8;
 $4 = $14;
 $15 = (__ZN10emscripten8internal19getGenericSignatureIJiiiEEEPKcv()|0);
 $16 = $8;
 $17 = (__ZN10emscripten8internal10getContextIM5BlockNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEEEPT_RKSB_($7)|0);
 $18 = (__ZN10emscripten8internal6TypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE3getEv()|0);
 $19 = $9;
 $3 = $19;
 $20 = (__ZN10emscripten8internal19getGenericSignatureIJviiiEEEPKcv()|0);
 $21 = $9;
 $22 = (__ZN10emscripten8internal10getContextIM5BlockNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEEEPT_RKSB_($7)|0);
 __embind_register_value_object_field(($11|0),($12|0),($13|0),($15|0),($16|0),($17|0),($18|0),($20|0),($21|0),($22|0));
 STACKTOP = sp;return ($10|0);
}
function __ZN10emscripten12value_objectI5BlockED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $4 = $1;
 __THREW__ = 0;
 $5 = (invoke_i(82)|0);
 $6 = __THREW__; __THREW__ = 0;
 $7 = $6&1;
 if (!($7)) {
  __THREW__ = 0;
  invoke_vi(88,($5|0));
  $8 = __THREW__; __THREW__ = 0;
  $9 = $8&1;
  if (!($9)) {
   __ZN10emscripten8internal11noncopyableD2Ev($4);
   STACKTOP = sp;return;
  }
 }
 $10 = ___cxa_find_matching_catch_3(0|0)|0;
 $11 = tempRet0;
 $2 = $10;
 $3 = $11;
 __ZN10emscripten8internal11noncopyableD2Ev($4);
 $12 = $2;
 ___clang_call_terminate($12);
 // unreachable;
}
function __ZN10emscripten15register_vectorI5BlockEENS_6class_INSt3__26vectorIT_NS3_9allocatorIS5_EEEENS_8internal11NoBaseClassEEEPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$field = 0, $$field11 = 0, $$field14 = 0, $$field19 = 0, $$field22 = 0, $$field27 = 0, $$field30 = 0, $$field37 = 0, $$field40 = 0, $$field6 = 0, $$index1 = 0, $$index13 = 0, $$index17 = 0, $$index21 = 0, $$index25 = 0, $$index29 = 0, $$index3 = 0, $$index33 = 0, $$index35 = 0, $$index39 = 0;
 var $$index43 = 0, $$index5 = 0, $$index9 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0;
 var $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $14 = 0, $15 = 0;
 var $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0;
 var $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0;
 var $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0;
 var $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0;
 var $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 256|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(256|0);
 $5 = sp + 228|0;
 $6 = sp + 250|0;
 $11 = sp + 208|0;
 $12 = sp + 249|0;
 $17 = sp + 184|0;
 $19 = sp + 248|0;
 $20 = sp + 16|0;
 $24 = sp + 160|0;
 $26 = sp + 247|0;
 $27 = sp + 8|0;
 $31 = sp + 136|0;
 $33 = sp + 246|0;
 $34 = sp;
 $38 = sp + 245|0;
 $52 = sp + 56|0;
 $53 = sp + 48|0;
 $54 = sp + 244|0;
 $55 = sp + 40|0;
 $56 = sp + 32|0;
 $57 = sp + 24|0;
 $51 = $1;
 HEAP32[$52>>2] = (89);
 $$index1 = ((($52)) + 4|0);
 HEAP32[$$index1>>2] = 0;
 HEAP32[$53>>2] = (90);
 $$index3 = ((($53)) + 4|0);
 HEAP32[$$index3>>2] = 0;
 $58 = $51;
 $45 = $54;
 $46 = $58;
 __ZN10emscripten8internal11NoBaseClass6verifyINSt3__26vectorI5BlockNS3_9allocatorIS5_EEEEEEvv();
 $47 = 91;
 $59 = (__ZN10emscripten8internal11NoBaseClass11getUpcasterINSt3__26vectorI5BlockNS3_9allocatorIS5_EEEEEEPFvvEv()|0);
 $48 = $59;
 $60 = (__ZN10emscripten8internal11NoBaseClass13getDowncasterINSt3__26vectorI5BlockNS3_9allocatorIS5_EEEEEEPFvvEv()|0);
 $49 = $60;
 $50 = 92;
 $61 = (__ZN10emscripten8internal6TypeIDINSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE3getEv()|0);
 $62 = (__ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerINSt3__26vectorI5BlockNS3_9allocatorIS5_EEEEEEE3getEv()|0);
 $63 = (__ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerIKNSt3__26vectorI5BlockNS3_9allocatorIS5_EEEEEEE3getEv()|0);
 $64 = (__ZN10emscripten8internal11NoBaseClass3getEv()|0);
 $65 = $47;
 $44 = $65;
 $66 = (__ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv()|0);
 $67 = $47;
 $68 = $48;
 $43 = $68;
 $69 = (__ZN10emscripten8internal19getGenericSignatureIJvEEEPKcv()|0);
 $70 = $48;
 $71 = $49;
 $42 = $71;
 $72 = (__ZN10emscripten8internal19getGenericSignatureIJvEEEPKcv()|0);
 $73 = $49;
 $74 = $46;
 $75 = $50;
 $41 = $75;
 $76 = (__ZN10emscripten8internal19getGenericSignatureIJviEEEPKcv()|0);
 $77 = $50;
 __embind_register_class(($61|0),($62|0),($63|0),($64|0),($66|0),($67|0),($69|0),($70|0),($72|0),($73|0),($74|0),($76|0),($77|0));
 $40 = $54;
 $78 = $40;
 $36 = $78;
 $37 = 93;
 $79 = $36;
 $39 = 94;
 $80 = (__ZN10emscripten8internal6TypeIDINSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE3getEv()|0);
 $81 = (__ZNK10emscripten8internal12WithPoliciesIJNS_18allow_raw_pointersEEE11ArgTypeListIJPNSt3__26vectorI5BlockNS5_9allocatorIS7_EEEEEE8getCountEv($38)|0);
 $82 = (__ZNK10emscripten8internal12WithPoliciesIJNS_18allow_raw_pointersEEE11ArgTypeListIJPNSt3__26vectorI5BlockNS5_9allocatorIS7_EEEEEE8getTypesEv($38)|0);
 $83 = $39;
 $35 = $83;
 $84 = (__ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv()|0);
 $85 = $39;
 $86 = $37;
 __embind_register_class_constructor(($80|0),($81|0),($82|0),($84|0),($85|0),($86|0));
 $$field = HEAP32[$52>>2]|0;
 $$index5 = ((($52)) + 4|0);
 $$field6 = HEAP32[$$index5>>2]|0;
 HEAP32[$55>>2] = $$field;
 $$index9 = ((($55)) + 4|0);
 HEAP32[$$index9>>2] = $$field6;
 ;HEAP8[$34>>0]=HEAP8[$55>>0]|0;HEAP8[$34+1>>0]=HEAP8[$55+1>>0]|0;HEAP8[$34+2>>0]=HEAP8[$55+2>>0]|0;HEAP8[$34+3>>0]=HEAP8[$55+3>>0]|0;HEAP8[$34+4>>0]=HEAP8[$55+4>>0]|0;HEAP8[$34+5>>0]=HEAP8[$55+5>>0]|0;HEAP8[$34+6>>0]=HEAP8[$55+6>>0]|0;HEAP8[$34+7>>0]=HEAP8[$55+7>>0]|0;
 $$field11 = HEAP32[$34>>2]|0;
 $$index13 = ((($34)) + 4|0);
 $$field14 = HEAP32[$$index13>>2]|0;
 $29 = $79;
 $30 = 1866;
 HEAP32[$31>>2] = $$field11;
 $$index17 = ((($31)) + 4|0);
 HEAP32[$$index17>>2] = $$field14;
 $87 = $29;
 $32 = 95;
 $88 = (__ZN10emscripten8internal6TypeIDINSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE3getEv()|0);
 $89 = $30;
 $90 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerINSt3__26vectorI5BlockNS5_9allocatorIS7_EEEEEERKS7_EE8getCountEv($33)|0);
 $91 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerINSt3__26vectorI5BlockNS5_9allocatorIS7_EEEEEERKS7_EE8getTypesEv($33)|0);
 $92 = $32;
 $28 = $92;
 $93 = (__ZN10emscripten8internal19getGenericSignatureIJviiiEEEPKcv()|0);
 $94 = $32;
 $95 = (__ZN10emscripten8internal10getContextIMNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEFvRKS4_EEEPT_RKSC_($31)|0);
 __embind_register_class_function(($88|0),($89|0),($90|0),($91|0),($93|0),($94|0),($95|0),0);
 $$field19 = HEAP32[$53>>2]|0;
 $$index21 = ((($53)) + 4|0);
 $$field22 = HEAP32[$$index21>>2]|0;
 HEAP32[$56>>2] = $$field19;
 $$index25 = ((($56)) + 4|0);
 HEAP32[$$index25>>2] = $$field22;
 ;HEAP8[$27>>0]=HEAP8[$56>>0]|0;HEAP8[$27+1>>0]=HEAP8[$56+1>>0]|0;HEAP8[$27+2>>0]=HEAP8[$56+2>>0]|0;HEAP8[$27+3>>0]=HEAP8[$56+3>>0]|0;HEAP8[$27+4>>0]=HEAP8[$56+4>>0]|0;HEAP8[$27+5>>0]=HEAP8[$56+5>>0]|0;HEAP8[$27+6>>0]=HEAP8[$56+6>>0]|0;HEAP8[$27+7>>0]=HEAP8[$56+7>>0]|0;
 $$field27 = HEAP32[$27>>2]|0;
 $$index29 = ((($27)) + 4|0);
 $$field30 = HEAP32[$$index29>>2]|0;
 $22 = $87;
 $23 = 1876;
 HEAP32[$24>>2] = $$field27;
 $$index33 = ((($24)) + 4|0);
 HEAP32[$$index33>>2] = $$field30;
 $96 = $22;
 $25 = 96;
 $97 = (__ZN10emscripten8internal6TypeIDINSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE3getEv()|0);
 $98 = $23;
 $99 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerINSt3__26vectorI5BlockNS5_9allocatorIS7_EEEEEEjRKS7_EE8getCountEv($26)|0);
 $100 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerINSt3__26vectorI5BlockNS5_9allocatorIS7_EEEEEEjRKS7_EE8getTypesEv($26)|0);
 $101 = $25;
 $21 = $101;
 $102 = (__ZN10emscripten8internal19getGenericSignatureIJviiiiEEEPKcv()|0);
 $103 = $25;
 $104 = (__ZN10emscripten8internal10getContextIMNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEFvjRKS4_EEEPT_RKSC_($24)|0);
 __embind_register_class_function(($97|0),($98|0),($99|0),($100|0),($102|0),($103|0),($104|0),0);
 HEAP32[$57>>2] = (97);
 $$index35 = ((($57)) + 4|0);
 HEAP32[$$index35>>2] = 0;
 ;HEAP8[$20>>0]=HEAP8[$57>>0]|0;HEAP8[$20+1>>0]=HEAP8[$57+1>>0]|0;HEAP8[$20+2>>0]=HEAP8[$57+2>>0]|0;HEAP8[$20+3>>0]=HEAP8[$57+3>>0]|0;HEAP8[$20+4>>0]=HEAP8[$57+4>>0]|0;HEAP8[$20+5>>0]=HEAP8[$57+5>>0]|0;HEAP8[$20+6>>0]=HEAP8[$57+6>>0]|0;HEAP8[$20+7>>0]=HEAP8[$57+7>>0]|0;
 $$field37 = HEAP32[$20>>2]|0;
 $$index39 = ((($20)) + 4|0);
 $$field40 = HEAP32[$$index39>>2]|0;
 $15 = $96;
 $16 = 1883;
 HEAP32[$17>>2] = $$field37;
 $$index43 = ((($17)) + 4|0);
 HEAP32[$$index43>>2] = $$field40;
 $105 = $15;
 $18 = 98;
 $106 = (__ZN10emscripten8internal6TypeIDINSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE3getEv()|0);
 $107 = $16;
 $108 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJjNS0_17AllowedRawPointerIKNSt3__26vectorI5BlockNS5_9allocatorIS7_EEEEEEEE8getCountEv($19)|0);
 $109 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJjNS0_17AllowedRawPointerIKNSt3__26vectorI5BlockNS5_9allocatorIS7_EEEEEEEE8getTypesEv($19)|0);
 $110 = $18;
 $14 = $110;
 $111 = (__ZN10emscripten8internal19getGenericSignatureIJiiiEEEPKcv()|0);
 $112 = $18;
 $113 = (__ZN10emscripten8internal10getContextIMNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEKFjvEEEPT_RKSA_($17)|0);
 __embind_register_class_function(($106|0),($107|0),($108|0),($109|0),($111|0),($112|0),($113|0),0);
 $9 = $105;
 $10 = 1888;
 HEAP32[$11>>2] = 99;
 $114 = $9;
 $13 = 100;
 $115 = (__ZN10emscripten8internal6TypeIDINSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE3getEv()|0);
 $116 = $10;
 $117 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJNS_3valERKNSt3__26vectorI5BlockNS5_9allocatorIS7_EEEEjEE8getCountEv($12)|0);
 $118 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJNS_3valERKNSt3__26vectorI5BlockNS5_9allocatorIS7_EEEEjEE8getTypesEv($12)|0);
 $119 = $13;
 $8 = $119;
 $120 = (__ZN10emscripten8internal19getGenericSignatureIJiiiiEEEPKcv()|0);
 $121 = $13;
 $122 = (__ZN10emscripten8internal10getContextIPFNS_3valERKNSt3__26vectorI5BlockNS3_9allocatorIS5_EEEEjEEEPT_RKSD_($11)|0);
 __embind_register_class_function(($115|0),($116|0),($117|0),($118|0),($120|0),($121|0),($122|0),0);
 $3 = $114;
 $4 = 1892;
 HEAP32[$5>>2] = 101;
 $7 = 102;
 $123 = (__ZN10emscripten8internal6TypeIDINSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE3getEv()|0);
 $124 = $4;
 $125 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJbRNSt3__26vectorI5BlockNS4_9allocatorIS6_EEEEjRKS6_EE8getCountEv($6)|0);
 $126 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJbRNSt3__26vectorI5BlockNS4_9allocatorIS6_EEEEjRKS6_EE8getTypesEv($6)|0);
 $127 = $7;
 $2 = $127;
 $128 = (__ZN10emscripten8internal19getGenericSignatureIJiiiiiEEEPKcv()|0);
 $129 = $7;
 $130 = (__ZN10emscripten8internal10getContextIPFbRNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEjRKS4_EEEPT_RKSD_($5)|0);
 __embind_register_class_function(($123|0),($124|0),($125|0),($126|0),($128|0),($129|0),($130|0),0);
 STACKTOP = sp;return;
}
function __ZN10emscripten8functionINS_3valEJNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEEJEEEvPKcPFT_DpT0_EDpT1_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = sp + 16|0;
 $3 = $0;
 $4 = $1;
 $6 = 103;
 $7 = $3;
 $8 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJNS_3valENSt3__26vectorI5BlockNS5_9allocatorIS7_EEEEEE8getCountEv($5)|0);
 $9 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJNS_3valENSt3__26vectorI5BlockNS5_9allocatorIS7_EEEEEE8getTypesEv($5)|0);
 $10 = $6;
 $2 = $10;
 $11 = (__ZN10emscripten8internal19getGenericSignatureIJiiiEEEPKcv()|0);
 $12 = $6;
 $13 = $4;
 __embind_register_function(($7|0),($8|0),($9|0),($11|0),($12|0),($13|0));
 STACKTOP = sp;return;
}
function __ZNSt3__213__vector_baseIiNS_9allocatorIiEEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 128|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(128|0);
 $19 = sp;
 $22 = sp + 116|0;
 $30 = $0;
 $31 = $30;
 $32 = HEAP32[$31>>2]|0;
 $33 = ($32|0)!=(0|0);
 if (!($33)) {
  STACKTOP = sp;return;
 }
 $29 = $31;
 $34 = $29;
 $35 = HEAP32[$34>>2]|0;
 $27 = $34;
 $28 = $35;
 $36 = $27;
 while(1) {
  $37 = $28;
  $38 = ((($36)) + 4|0);
  $39 = HEAP32[$38>>2]|0;
  $40 = ($37|0)!=($39|0);
  if (!($40)) {
   break;
  }
  $26 = $36;
  $41 = $26;
  $42 = ((($41)) + 8|0);
  $25 = $42;
  $43 = $25;
  $24 = $43;
  $44 = $24;
  $45 = ((($36)) + 4|0);
  $46 = HEAP32[$45>>2]|0;
  $47 = ((($46)) + -4|0);
  HEAP32[$45>>2] = $47;
  $23 = $47;
  $48 = $23;
  $20 = $44;
  $21 = $48;
  $49 = $20;
  $50 = $21;
  ;HEAP8[$19>>0]=HEAP8[$22>>0]|0;
  $17 = $49;
  $18 = $50;
  $51 = $17;
  $52 = $18;
  $15 = $51;
  $16 = $52;
 }
 $7 = $31;
 $53 = $7;
 $54 = ((($53)) + 8|0);
 $6 = $54;
 $55 = $6;
 $5 = $55;
 $56 = $5;
 $57 = HEAP32[$31>>2]|0;
 $4 = $31;
 $58 = $4;
 $3 = $58;
 $59 = $3;
 $60 = ((($59)) + 8|0);
 $2 = $60;
 $61 = $2;
 $1 = $61;
 $62 = $1;
 $63 = HEAP32[$62>>2]|0;
 $64 = HEAP32[$58>>2]|0;
 $65 = $63;
 $66 = $64;
 $67 = (($65) - ($66))|0;
 $68 = (($67|0) / 4)&-1;
 $12 = $56;
 $13 = $57;
 $14 = $68;
 $69 = $12;
 $70 = $13;
 $71 = $14;
 $9 = $69;
 $10 = $70;
 $11 = $71;
 $72 = $10;
 $8 = $72;
 $73 = $8;
 __ZdlPv($73);
 STACKTOP = sp;return;
}
function ___clang_call_terminate($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 (___cxa_begin_catch(($0|0))|0);
 __ZSt9terminatev();
 // unreachable;
}
function __ZNSt3__213__vector_baseINS_6vectorIiNS_9allocatorIiEEEENS2_IS4_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 128|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(128|0);
 $19 = sp;
 $22 = sp + 116|0;
 $30 = $0;
 $31 = $30;
 $32 = HEAP32[$31>>2]|0;
 $33 = ($32|0)!=(0|0);
 if (!($33)) {
  STACKTOP = sp;return;
 }
 $29 = $31;
 $34 = $29;
 $35 = HEAP32[$34>>2]|0;
 $27 = $34;
 $28 = $35;
 $36 = $27;
 while(1) {
  $37 = $28;
  $38 = ((($36)) + 4|0);
  $39 = HEAP32[$38>>2]|0;
  $40 = ($37|0)!=($39|0);
  if (!($40)) {
   break;
  }
  $26 = $36;
  $41 = $26;
  $42 = ((($41)) + 8|0);
  $25 = $42;
  $43 = $25;
  $24 = $43;
  $44 = $24;
  $45 = ((($36)) + 4|0);
  $46 = HEAP32[$45>>2]|0;
  $47 = ((($46)) + -12|0);
  HEAP32[$45>>2] = $47;
  $23 = $47;
  $48 = $23;
  $20 = $44;
  $21 = $48;
  $49 = $20;
  $50 = $21;
  ;HEAP8[$19>>0]=HEAP8[$22>>0]|0;
  $17 = $49;
  $18 = $50;
  $51 = $17;
  $52 = $18;
  $15 = $51;
  $16 = $52;
  $53 = $16;
  __ZNSt3__26vectorIiNS_9allocatorIiEEED2Ev($53);
 }
 $14 = $31;
 $54 = $14;
 $55 = ((($54)) + 8|0);
 $13 = $55;
 $56 = $13;
 $12 = $56;
 $57 = $12;
 $58 = HEAP32[$31>>2]|0;
 $4 = $31;
 $59 = $4;
 $3 = $59;
 $60 = $3;
 $61 = ((($60)) + 8|0);
 $2 = $61;
 $62 = $2;
 $1 = $62;
 $63 = $1;
 $64 = HEAP32[$63>>2]|0;
 $65 = HEAP32[$59>>2]|0;
 $66 = $64;
 $67 = $65;
 $68 = (($66) - ($67))|0;
 $69 = (($68|0) / 12)&-1;
 $9 = $57;
 $10 = $58;
 $11 = $69;
 $70 = $9;
 $71 = $10;
 $72 = $11;
 $6 = $70;
 $7 = $71;
 $8 = $72;
 $73 = $7;
 $5 = $73;
 $74 = $5;
 __ZdlPv($74);
 STACKTOP = sp;return;
}
function __ZNSt3__213__vector_baseIfNS_9allocatorIfEEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 128|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(128|0);
 $19 = sp;
 $22 = sp + 116|0;
 $30 = $0;
 $31 = $30;
 $32 = HEAP32[$31>>2]|0;
 $33 = ($32|0)!=(0|0);
 if (!($33)) {
  STACKTOP = sp;return;
 }
 $29 = $31;
 $34 = $29;
 $35 = HEAP32[$34>>2]|0;
 $27 = $34;
 $28 = $35;
 $36 = $27;
 while(1) {
  $37 = $28;
  $38 = ((($36)) + 4|0);
  $39 = HEAP32[$38>>2]|0;
  $40 = ($37|0)!=($39|0);
  if (!($40)) {
   break;
  }
  $26 = $36;
  $41 = $26;
  $42 = ((($41)) + 8|0);
  $25 = $42;
  $43 = $25;
  $24 = $43;
  $44 = $24;
  $45 = ((($36)) + 4|0);
  $46 = HEAP32[$45>>2]|0;
  $47 = ((($46)) + -4|0);
  HEAP32[$45>>2] = $47;
  $23 = $47;
  $48 = $23;
  $20 = $44;
  $21 = $48;
  $49 = $20;
  $50 = $21;
  ;HEAP8[$19>>0]=HEAP8[$22>>0]|0;
  $17 = $49;
  $18 = $50;
  $51 = $17;
  $52 = $18;
  $15 = $51;
  $16 = $52;
 }
 $7 = $31;
 $53 = $7;
 $54 = ((($53)) + 8|0);
 $6 = $54;
 $55 = $6;
 $5 = $55;
 $56 = $5;
 $57 = HEAP32[$31>>2]|0;
 $4 = $31;
 $58 = $4;
 $3 = $58;
 $59 = $3;
 $60 = ((($59)) + 8|0);
 $2 = $60;
 $61 = $2;
 $1 = $61;
 $62 = $1;
 $63 = HEAP32[$62>>2]|0;
 $64 = HEAP32[$58>>2]|0;
 $65 = $63;
 $66 = $64;
 $67 = (($65) - ($66))|0;
 $68 = (($67|0) / 4)&-1;
 $12 = $56;
 $13 = $57;
 $14 = $68;
 $69 = $12;
 $70 = $13;
 $71 = $14;
 $9 = $69;
 $10 = $70;
 $11 = $71;
 $72 = $10;
 $8 = $72;
 $73 = $8;
 __ZdlPv($73);
 STACKTOP = sp;return;
}
function __ZNSt3__213__vector_baseINS_6vectorIfNS_9allocatorIfEEEENS2_IS4_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 128|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(128|0);
 $19 = sp;
 $22 = sp + 116|0;
 $30 = $0;
 $31 = $30;
 $32 = HEAP32[$31>>2]|0;
 $33 = ($32|0)!=(0|0);
 if (!($33)) {
  STACKTOP = sp;return;
 }
 $29 = $31;
 $34 = $29;
 $35 = HEAP32[$34>>2]|0;
 $27 = $34;
 $28 = $35;
 $36 = $27;
 while(1) {
  $37 = $28;
  $38 = ((($36)) + 4|0);
  $39 = HEAP32[$38>>2]|0;
  $40 = ($37|0)!=($39|0);
  if (!($40)) {
   break;
  }
  $26 = $36;
  $41 = $26;
  $42 = ((($41)) + 8|0);
  $25 = $42;
  $43 = $25;
  $24 = $43;
  $44 = $24;
  $45 = ((($36)) + 4|0);
  $46 = HEAP32[$45>>2]|0;
  $47 = ((($46)) + -12|0);
  HEAP32[$45>>2] = $47;
  $23 = $47;
  $48 = $23;
  $20 = $44;
  $21 = $48;
  $49 = $20;
  $50 = $21;
  ;HEAP8[$19>>0]=HEAP8[$22>>0]|0;
  $17 = $49;
  $18 = $50;
  $51 = $17;
  $52 = $18;
  $15 = $51;
  $16 = $52;
  $53 = $16;
  __ZNSt3__26vectorIfNS_9allocatorIfEEED2Ev($53);
 }
 $14 = $31;
 $54 = $14;
 $55 = ((($54)) + 8|0);
 $13 = $55;
 $56 = $13;
 $12 = $56;
 $57 = $12;
 $58 = HEAP32[$31>>2]|0;
 $4 = $31;
 $59 = $4;
 $3 = $59;
 $60 = $3;
 $61 = ((($60)) + 8|0);
 $2 = $61;
 $62 = $2;
 $1 = $62;
 $63 = $1;
 $64 = HEAP32[$63>>2]|0;
 $65 = HEAP32[$59>>2]|0;
 $66 = $64;
 $67 = $65;
 $68 = (($66) - ($67))|0;
 $69 = (($68|0) / 12)&-1;
 $9 = $57;
 $10 = $58;
 $11 = $69;
 $70 = $9;
 $71 = $10;
 $72 = $11;
 $6 = $70;
 $7 = $71;
 $8 = $72;
 $73 = $7;
 $5 = $73;
 $74 = $5;
 __ZdlPv($74);
 STACKTOP = sp;return;
}
function __ZN10emscripten3valC2EPNS_8internal7_EM_VALE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 HEAP32[$4>>2] = $5;
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorIiNS_9allocatorIiEEE8allocateEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $15 = $0;
 $16 = $1;
 $17 = $15;
 $18 = $16;
 $19 = (__ZNKSt3__26vectorIiNS_9allocatorIiEEE8max_sizeEv($17)|0);
 $20 = ($18>>>0)>($19>>>0);
 if ($20) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($17);
  // unreachable;
 }
 $14 = $17;
 $21 = $14;
 $22 = ((($21)) + 8|0);
 $13 = $22;
 $23 = $13;
 $12 = $23;
 $24 = $12;
 $25 = $16;
 $10 = $24;
 $11 = $25;
 $26 = $10;
 $27 = $11;
 $7 = $26;
 $8 = $27;
 $9 = 0;
 $28 = $7;
 $29 = $8;
 $6 = $28;
 $30 = ($29>>>0)>(1073741823);
 if ($30) {
  $31 = (___cxa_allocate_exception(4)|0);
  __ZNSt9bad_allocC2Ev($31);
  ___cxa_throw(($31|0),(360|0),(18|0));
  // unreachable;
 } else {
  $32 = $8;
  $33 = $32<<2;
  $5 = $33;
  $34 = $5;
  $35 = (__Znwj($34)|0);
  $36 = ((($17)) + 4|0);
  HEAP32[$36>>2] = $35;
  HEAP32[$17>>2] = $35;
  $37 = HEAP32[$17>>2]|0;
  $38 = $16;
  $39 = (($37) + ($38<<2)|0);
  $4 = $17;
  $40 = $4;
  $41 = ((($40)) + 8|0);
  $3 = $41;
  $42 = $3;
  $2 = $42;
  $43 = $2;
  HEAP32[$43>>2] = $39;
  __ZNKSt3__26vectorIiNS_9allocatorIiEEE14__annotate_newEj($17,0);
  STACKTOP = sp;return;
 }
}
function __ZNSt3__26vectorIiNS_9allocatorIiEEE18__construct_at_endIPKiEENS_9enable_ifIXsr21__is_forward_iteratorIT_EE5valueEvE4typeES8_S8_j($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 112|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(112|0);
 $12 = sp;
 $17 = sp + 105|0;
 $31 = sp + 104|0;
 $26 = $0;
 $27 = $1;
 $28 = $2;
 $29 = $3;
 $32 = $26;
 $25 = $32;
 $33 = $25;
 $34 = ((($33)) + 8|0);
 $24 = $34;
 $35 = $24;
 $23 = $35;
 $36 = $23;
 $30 = $36;
 $37 = $29;
 __ZNSt3__26vectorIiNS_9allocatorIiEEE24__RAII_IncreaseAnnotatorC2ERKS3_j($31,$32,$37);
 $38 = $30;
 $39 = $27;
 $40 = $28;
 $41 = ((($32)) + 4|0);
 $19 = $38;
 $20 = $39;
 $21 = $40;
 $22 = $41;
 while(1) {
  $42 = $20;
  $43 = $21;
  $44 = ($42|0)!=($43|0);
  if (!($44)) {
   break;
  }
  $45 = $19;
  $46 = $22;
  $47 = HEAP32[$46>>2]|0;
  $18 = $47;
  $48 = $18;
  $49 = $20;
  $14 = $45;
  $15 = $48;
  $16 = $49;
  $50 = $14;
  $51 = $15;
  $52 = $16;
  $13 = $52;
  $53 = $13;
  ;HEAP8[$12>>0]=HEAP8[$17>>0]|0;
  $9 = $50;
  $10 = $51;
  $11 = $53;
  $54 = $9;
  $55 = $10;
  $56 = $11;
  $8 = $56;
  $57 = $8;
  $5 = $54;
  $6 = $55;
  $7 = $57;
  $58 = $6;
  $59 = $7;
  $4 = $59;
  $60 = $4;
  $61 = HEAP32[$60>>2]|0;
  HEAP32[$58>>2] = $61;
  $62 = $20;
  $63 = ((($62)) + 4|0);
  $20 = $63;
  $64 = $22;
  $65 = HEAP32[$64>>2]|0;
  $66 = ((($65)) + 4|0);
  HEAP32[$64>>2] = $66;
 }
 __ZNSt3__26vectorIiNS_9allocatorIiEEE24__RAII_IncreaseAnnotator6__doneEv($31);
 STACKTOP = sp;return;
}
function __ZNKSt3__26vectorIiNS_9allocatorIiEEE8max_sizeEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $6 = sp + 8|0;
 $9 = sp + 77|0;
 $12 = sp;
 $14 = sp + 76|0;
 $19 = sp + 16|0;
 $20 = sp + 12|0;
 $18 = $0;
 $21 = $18;
 $17 = $21;
 $22 = $17;
 $23 = ((($22)) + 8|0);
 $16 = $23;
 $24 = $16;
 $15 = $24;
 $25 = $15;
 $13 = $25;
 $26 = $13;
 ;HEAP8[$12>>0]=HEAP8[$14>>0]|0;
 $11 = $26;
 $27 = $11;
 $10 = $27;
 HEAP32[$19>>2] = 1073741823;
 $28 = (4294967295 / 2)&-1;
 HEAP32[$20>>2] = $28;
 $7 = $19;
 $8 = $20;
 $29 = $7;
 $30 = $8;
 ;HEAP8[$6>>0]=HEAP8[$9>>0]|0;
 $4 = $29;
 $5 = $30;
 $31 = $5;
 $32 = $4;
 $1 = $6;
 $2 = $31;
 $3 = $32;
 $33 = $2;
 $34 = HEAP32[$33>>2]|0;
 $35 = $3;
 $36 = HEAP32[$35>>2]|0;
 $37 = ($34>>>0)<($36>>>0);
 $38 = $5;
 $39 = $4;
 $40 = $37 ? $38 : $39;
 $41 = HEAP32[$40>>2]|0;
 STACKTOP = sp;return ($41|0);
}
function __ZNKSt3__26vectorIiNS_9allocatorIiEEE14__annotate_newEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $20 = $0;
 $21 = $1;
 $22 = $20;
 $19 = $22;
 $23 = $19;
 $24 = HEAP32[$23>>2]|0;
 $18 = $24;
 $25 = $18;
 $17 = $22;
 $26 = $17;
 $27 = HEAP32[$26>>2]|0;
 $16 = $27;
 $28 = $16;
 $6 = $22;
 $29 = $6;
 $5 = $29;
 $30 = $5;
 $4 = $30;
 $31 = $4;
 $32 = ((($31)) + 8|0);
 $3 = $32;
 $33 = $3;
 $2 = $33;
 $34 = $2;
 $35 = HEAP32[$34>>2]|0;
 $36 = HEAP32[$30>>2]|0;
 $37 = $35;
 $38 = $36;
 $39 = (($37) - ($38))|0;
 $40 = (($39|0) / 4)&-1;
 $41 = (($28) + ($40<<2)|0);
 $8 = $22;
 $42 = $8;
 $43 = HEAP32[$42>>2]|0;
 $7 = $43;
 $44 = $7;
 $13 = $22;
 $45 = $13;
 $12 = $45;
 $46 = $12;
 $11 = $46;
 $47 = $11;
 $48 = ((($47)) + 8|0);
 $10 = $48;
 $49 = $10;
 $9 = $49;
 $50 = $9;
 $51 = HEAP32[$50>>2]|0;
 $52 = HEAP32[$46>>2]|0;
 $53 = $51;
 $54 = $52;
 $55 = (($53) - ($54))|0;
 $56 = (($55|0) / 4)&-1;
 $57 = (($44) + ($56<<2)|0);
 $15 = $22;
 $58 = $15;
 $59 = HEAP32[$58>>2]|0;
 $14 = $59;
 $60 = $14;
 $61 = $21;
 $62 = (($60) + ($61<<2)|0);
 __ZNKSt3__26vectorIiNS_9allocatorIiEEE31__annotate_contiguous_containerEPKvS5_S5_S5_($22,$25,$41,$57,$62);
 STACKTOP = sp;return;
}
function __ZNKSt3__26vectorIiNS_9allocatorIiEEE31__annotate_contiguous_containerEPKvS5_S5_S5_($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $8 = $3;
 $9 = $4;
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorIiNS_9allocatorIiEEE24__RAII_IncreaseAnnotatorC2ERKS3_j($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorIiNS_9allocatorIiEEE24__RAII_IncreaseAnnotator6__doneEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE8allocateEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $15 = $0;
 $16 = $1;
 $17 = $15;
 $18 = $16;
 $19 = (__ZNKSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE8max_sizeEv($17)|0);
 $20 = ($18>>>0)>($19>>>0);
 if ($20) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($17);
  // unreachable;
 }
 $14 = $17;
 $21 = $14;
 $22 = ((($21)) + 8|0);
 $13 = $22;
 $23 = $13;
 $12 = $23;
 $24 = $12;
 $25 = $16;
 $10 = $24;
 $11 = $25;
 $26 = $10;
 $27 = $11;
 $7 = $26;
 $8 = $27;
 $9 = 0;
 $28 = $7;
 $29 = $8;
 $6 = $28;
 $30 = ($29>>>0)>(357913941);
 if ($30) {
  $31 = (___cxa_allocate_exception(4)|0);
  __ZNSt9bad_allocC2Ev($31);
  ___cxa_throw(($31|0),(360|0),(18|0));
  // unreachable;
 } else {
  $32 = $8;
  $33 = ($32*12)|0;
  $5 = $33;
  $34 = $5;
  $35 = (__Znwj($34)|0);
  $36 = ((($17)) + 4|0);
  HEAP32[$36>>2] = $35;
  HEAP32[$17>>2] = $35;
  $37 = HEAP32[$17>>2]|0;
  $38 = $16;
  $39 = (($37) + (($38*12)|0)|0);
  $4 = $17;
  $40 = $4;
  $41 = ((($40)) + 8|0);
  $3 = $41;
  $42 = $3;
  $2 = $42;
  $43 = $2;
  HEAP32[$43>>2] = $39;
  __ZNKSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE14__annotate_newEj($17,0);
  STACKTOP = sp;return;
 }
}
function __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE18__construct_at_endIPKS3_EENS_9enable_ifIXsr21__is_forward_iteratorIT_EE5valueEvE4typeESA_SA_j($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 112|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(112|0);
 $12 = sp;
 $17 = sp + 105|0;
 $31 = sp + 104|0;
 $26 = $0;
 $27 = $1;
 $28 = $2;
 $29 = $3;
 $32 = $26;
 $25 = $32;
 $33 = $25;
 $34 = ((($33)) + 8|0);
 $24 = $34;
 $35 = $24;
 $23 = $35;
 $36 = $23;
 $30 = $36;
 $37 = $29;
 __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotatorC2ERKS5_j($31,$32,$37);
 $38 = $30;
 $39 = $27;
 $40 = $28;
 $41 = ((($32)) + 4|0);
 $19 = $38;
 $20 = $39;
 $21 = $40;
 $22 = $41;
 while(1) {
  $42 = $20;
  $43 = $21;
  $44 = ($42|0)!=($43|0);
  if (!($44)) {
   break;
  }
  $45 = $19;
  $46 = $22;
  $47 = HEAP32[$46>>2]|0;
  $18 = $47;
  $48 = $18;
  $49 = $20;
  $14 = $45;
  $15 = $48;
  $16 = $49;
  $50 = $14;
  $51 = $15;
  $52 = $16;
  $13 = $52;
  $53 = $13;
  ;HEAP8[$12>>0]=HEAP8[$17>>0]|0;
  $9 = $50;
  $10 = $51;
  $11 = $53;
  $54 = $9;
  $55 = $10;
  $56 = $11;
  $8 = $56;
  $57 = $8;
  $5 = $54;
  $6 = $55;
  $7 = $57;
  $58 = $6;
  $59 = $7;
  $4 = $59;
  $60 = $4;
  __ZNSt3__26vectorIiNS_9allocatorIiEEEC2ERKS3_($58,$60);
  $61 = $20;
  $62 = ((($61)) + 12|0);
  $20 = $62;
  $63 = $22;
  $64 = HEAP32[$63>>2]|0;
  $65 = ((($64)) + 12|0);
  HEAP32[$63>>2] = $65;
 }
 __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotator6__doneEv($31);
 STACKTOP = sp;return;
}
function __ZNKSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE8max_sizeEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $6 = sp + 8|0;
 $9 = sp + 77|0;
 $12 = sp;
 $14 = sp + 76|0;
 $19 = sp + 16|0;
 $20 = sp + 12|0;
 $18 = $0;
 $21 = $18;
 $17 = $21;
 $22 = $17;
 $23 = ((($22)) + 8|0);
 $16 = $23;
 $24 = $16;
 $15 = $24;
 $25 = $15;
 $13 = $25;
 $26 = $13;
 ;HEAP8[$12>>0]=HEAP8[$14>>0]|0;
 $11 = $26;
 $27 = $11;
 $10 = $27;
 HEAP32[$19>>2] = 357913941;
 $28 = (4294967295 / 2)&-1;
 HEAP32[$20>>2] = $28;
 $7 = $19;
 $8 = $20;
 $29 = $7;
 $30 = $8;
 ;HEAP8[$6>>0]=HEAP8[$9>>0]|0;
 $4 = $29;
 $5 = $30;
 $31 = $5;
 $32 = $4;
 $1 = $6;
 $2 = $31;
 $3 = $32;
 $33 = $2;
 $34 = HEAP32[$33>>2]|0;
 $35 = $3;
 $36 = HEAP32[$35>>2]|0;
 $37 = ($34>>>0)<($36>>>0);
 $38 = $5;
 $39 = $4;
 $40 = $37 ? $38 : $39;
 $41 = HEAP32[$40>>2]|0;
 STACKTOP = sp;return ($41|0);
}
function __ZNKSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE14__annotate_newEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $20 = $0;
 $21 = $1;
 $22 = $20;
 $19 = $22;
 $23 = $19;
 $24 = HEAP32[$23>>2]|0;
 $18 = $24;
 $25 = $18;
 $17 = $22;
 $26 = $17;
 $27 = HEAP32[$26>>2]|0;
 $16 = $27;
 $28 = $16;
 $6 = $22;
 $29 = $6;
 $5 = $29;
 $30 = $5;
 $4 = $30;
 $31 = $4;
 $32 = ((($31)) + 8|0);
 $3 = $32;
 $33 = $3;
 $2 = $33;
 $34 = $2;
 $35 = HEAP32[$34>>2]|0;
 $36 = HEAP32[$30>>2]|0;
 $37 = $35;
 $38 = $36;
 $39 = (($37) - ($38))|0;
 $40 = (($39|0) / 12)&-1;
 $41 = (($28) + (($40*12)|0)|0);
 $8 = $22;
 $42 = $8;
 $43 = HEAP32[$42>>2]|0;
 $7 = $43;
 $44 = $7;
 $13 = $22;
 $45 = $13;
 $12 = $45;
 $46 = $12;
 $11 = $46;
 $47 = $11;
 $48 = ((($47)) + 8|0);
 $10 = $48;
 $49 = $10;
 $9 = $49;
 $50 = $9;
 $51 = HEAP32[$50>>2]|0;
 $52 = HEAP32[$46>>2]|0;
 $53 = $51;
 $54 = $52;
 $55 = (($53) - ($54))|0;
 $56 = (($55|0) / 12)&-1;
 $57 = (($44) + (($56*12)|0)|0);
 $15 = $22;
 $58 = $15;
 $59 = HEAP32[$58>>2]|0;
 $14 = $59;
 $60 = $14;
 $61 = $21;
 $62 = (($60) + (($61*12)|0)|0);
 __ZNKSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE31__annotate_contiguous_containerEPKvS7_S7_S7_($22,$25,$41,$57,$62);
 STACKTOP = sp;return;
}
function __ZNKSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE31__annotate_contiguous_containerEPKvS7_S7_S7_($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $8 = $3;
 $9 = $4;
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotatorC2ERKS5_j($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE24__RAII_IncreaseAnnotator6__doneEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorIiNS_9allocatorIiEEEC2ERKS3_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0;
 var $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 112|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(112|0);
 $7 = sp + 84|0;
 $8 = sp + 16|0;
 $11 = sp + 72|0;
 $12 = sp + 111|0;
 $13 = sp + 8|0;
 $17 = sp + 110|0;
 $19 = sp;
 $21 = sp + 109|0;
 $27 = sp + 108|0;
 $25 = $0;
 $26 = $1;
 $31 = $25;
 $32 = $26;
 $24 = $32;
 $33 = $24;
 $34 = ((($33)) + 8|0);
 $23 = $34;
 $35 = $23;
 $22 = $35;
 $36 = $22;
 $20 = $36;
 $37 = $20;
 ;HEAP8[$19>>0]=HEAP8[$21>>0]|0;
 $18 = $37;
 $15 = $31;
 $16 = $27;
 $38 = $15;
 $14 = $38;
 HEAP32[$38>>2] = 0;
 $39 = ((($38)) + 4|0);
 HEAP32[$39>>2] = 0;
 $40 = ((($38)) + 8|0);
 ;HEAP8[$13>>0]=HEAP8[$17>>0]|0;
 $10 = $40;
 HEAP32[$11>>2] = 0;
 $41 = $10;
 $9 = $11;
 $42 = $9;
 $43 = HEAP32[$42>>2]|0;
 $3 = $13;
 ;HEAP8[$8>>0]=HEAP8[$12>>0]|0;
 $6 = $41;
 HEAP32[$7>>2] = $43;
 $44 = $6;
 $5 = $8;
 $4 = $7;
 $45 = $4;
 $46 = HEAP32[$45>>2]|0;
 HEAP32[$44>>2] = $46;
 $47 = $26;
 $2 = $47;
 $48 = $2;
 $49 = ((($48)) + 4|0);
 $50 = HEAP32[$49>>2]|0;
 $51 = HEAP32[$48>>2]|0;
 $52 = $50;
 $53 = $51;
 $54 = (($52) - ($53))|0;
 $55 = (($54|0) / 4)&-1;
 $28 = $55;
 $56 = $28;
 $57 = ($56>>>0)>(0);
 if (!($57)) {
  STACKTOP = sp;return;
 }
 $58 = $28;
 __THREW__ = 0;
 invoke_vii(34,($31|0),($58|0));
 $59 = __THREW__; __THREW__ = 0;
 $60 = $59&1;
 if ($60) {
  $69 = ___cxa_find_matching_catch_2()|0;
  $70 = tempRet0;
  $29 = $69;
  $30 = $70;
  __ZNSt3__213__vector_baseIiNS_9allocatorIiEEED2Ev($31);
  $71 = $29;
  $72 = $30;
  ___resumeException($71|0);
  // unreachable;
 }
 $61 = $26;
 $62 = HEAP32[$61>>2]|0;
 $63 = $26;
 $64 = ((($63)) + 4|0);
 $65 = HEAP32[$64>>2]|0;
 $66 = $28;
 __THREW__ = 0;
 invoke_viiii(104,($31|0),($62|0),($65|0),($66|0));
 $67 = __THREW__; __THREW__ = 0;
 $68 = $67&1;
 if ($68) {
  $69 = ___cxa_find_matching_catch_2()|0;
  $70 = tempRet0;
  $29 = $69;
  $30 = $70;
  __ZNSt3__213__vector_baseIiNS_9allocatorIiEEED2Ev($31);
  $71 = $29;
  $72 = $30;
  ___resumeException($71|0);
  // unreachable;
 } else {
  STACKTOP = sp;return;
 }
}
function __ZNSt3__26vectorIiNS_9allocatorIiEEE18__construct_at_endIPiEENS_9enable_ifIXsr21__is_forward_iteratorIT_EE5valueEvE4typeES7_S7_j($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $17 = sp + 52|0;
 $12 = $0;
 $13 = $1;
 $14 = $2;
 $15 = $3;
 $18 = $12;
 $11 = $18;
 $19 = $11;
 $20 = ((($19)) + 8|0);
 $10 = $20;
 $21 = $10;
 $9 = $21;
 $22 = $9;
 $16 = $22;
 $23 = $15;
 __ZNSt3__26vectorIiNS_9allocatorIiEEE24__RAII_IncreaseAnnotatorC2ERKS3_j($17,$18,$23);
 $24 = $16;
 $25 = $13;
 $26 = $14;
 $27 = ((($18)) + 4|0);
 $4 = $24;
 $5 = $25;
 $6 = $26;
 $7 = $27;
 $28 = $6;
 $29 = $5;
 $30 = $28;
 $31 = $29;
 $32 = (($30) - ($31))|0;
 $33 = (($32|0) / 4)&-1;
 $8 = $33;
 $34 = $8;
 $35 = ($34|0)>(0);
 if (!($35)) {
  __ZNSt3__26vectorIiNS_9allocatorIiEEE24__RAII_IncreaseAnnotator6__doneEv($17);
  STACKTOP = sp;return;
 }
 $36 = $7;
 $37 = HEAP32[$36>>2]|0;
 $38 = $5;
 $39 = $8;
 $40 = $39<<2;
 _memcpy(($37|0),($38|0),($40|0))|0;
 $41 = $8;
 $42 = $7;
 $43 = HEAP32[$42>>2]|0;
 $44 = (($43) + ($41<<2)|0);
 HEAP32[$42>>2] = $44;
 __ZNSt3__26vectorIiNS_9allocatorIiEEE24__RAII_IncreaseAnnotator6__doneEv($17);
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorIfNS_9allocatorIfEEE8allocateEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $15 = $0;
 $16 = $1;
 $17 = $15;
 $18 = $16;
 $19 = (__ZNKSt3__26vectorIfNS_9allocatorIfEEE8max_sizeEv($17)|0);
 $20 = ($18>>>0)>($19>>>0);
 if ($20) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($17);
  // unreachable;
 }
 $14 = $17;
 $21 = $14;
 $22 = ((($21)) + 8|0);
 $13 = $22;
 $23 = $13;
 $12 = $23;
 $24 = $12;
 $25 = $16;
 $10 = $24;
 $11 = $25;
 $26 = $10;
 $27 = $11;
 $7 = $26;
 $8 = $27;
 $9 = 0;
 $28 = $7;
 $29 = $8;
 $6 = $28;
 $30 = ($29>>>0)>(1073741823);
 if ($30) {
  $31 = (___cxa_allocate_exception(4)|0);
  __ZNSt9bad_allocC2Ev($31);
  ___cxa_throw(($31|0),(360|0),(18|0));
  // unreachable;
 } else {
  $32 = $8;
  $33 = $32<<2;
  $5 = $33;
  $34 = $5;
  $35 = (__Znwj($34)|0);
  $36 = ((($17)) + 4|0);
  HEAP32[$36>>2] = $35;
  HEAP32[$17>>2] = $35;
  $37 = HEAP32[$17>>2]|0;
  $38 = $16;
  $39 = (($37) + ($38<<2)|0);
  $4 = $17;
  $40 = $4;
  $41 = ((($40)) + 8|0);
  $3 = $41;
  $42 = $3;
  $2 = $42;
  $43 = $2;
  HEAP32[$43>>2] = $39;
  __ZNKSt3__26vectorIfNS_9allocatorIfEEE14__annotate_newEj($17,0);
  STACKTOP = sp;return;
 }
}
function __ZNSt3__26vectorIfNS_9allocatorIfEEE18__construct_at_endIPKfEENS_9enable_ifIXsr21__is_forward_iteratorIT_EE5valueEvE4typeES8_S8_j($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0.0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 112|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(112|0);
 $12 = sp;
 $17 = sp + 105|0;
 $31 = sp + 104|0;
 $26 = $0;
 $27 = $1;
 $28 = $2;
 $29 = $3;
 $32 = $26;
 $25 = $32;
 $33 = $25;
 $34 = ((($33)) + 8|0);
 $24 = $34;
 $35 = $24;
 $23 = $35;
 $36 = $23;
 $30 = $36;
 $37 = $29;
 __ZNSt3__26vectorIfNS_9allocatorIfEEE24__RAII_IncreaseAnnotatorC2ERKS3_j($31,$32,$37);
 $38 = $30;
 $39 = $27;
 $40 = $28;
 $41 = ((($32)) + 4|0);
 $19 = $38;
 $20 = $39;
 $21 = $40;
 $22 = $41;
 while(1) {
  $42 = $20;
  $43 = $21;
  $44 = ($42|0)!=($43|0);
  if (!($44)) {
   break;
  }
  $45 = $19;
  $46 = $22;
  $47 = HEAP32[$46>>2]|0;
  $18 = $47;
  $48 = $18;
  $49 = $20;
  $14 = $45;
  $15 = $48;
  $16 = $49;
  $50 = $14;
  $51 = $15;
  $52 = $16;
  $13 = $52;
  $53 = $13;
  ;HEAP8[$12>>0]=HEAP8[$17>>0]|0;
  $9 = $50;
  $10 = $51;
  $11 = $53;
  $54 = $9;
  $55 = $10;
  $56 = $11;
  $8 = $56;
  $57 = $8;
  $5 = $54;
  $6 = $55;
  $7 = $57;
  $58 = $6;
  $59 = $7;
  $4 = $59;
  $60 = $4;
  $61 = +HEAPF32[$60>>2];
  HEAPF32[$58>>2] = $61;
  $62 = $20;
  $63 = ((($62)) + 4|0);
  $20 = $63;
  $64 = $22;
  $65 = HEAP32[$64>>2]|0;
  $66 = ((($65)) + 4|0);
  HEAP32[$64>>2] = $66;
 }
 __ZNSt3__26vectorIfNS_9allocatorIfEEE24__RAII_IncreaseAnnotator6__doneEv($31);
 STACKTOP = sp;return;
}
function __ZNKSt3__26vectorIfNS_9allocatorIfEEE8max_sizeEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $6 = sp + 8|0;
 $9 = sp + 77|0;
 $12 = sp;
 $14 = sp + 76|0;
 $19 = sp + 16|0;
 $20 = sp + 12|0;
 $18 = $0;
 $21 = $18;
 $17 = $21;
 $22 = $17;
 $23 = ((($22)) + 8|0);
 $16 = $23;
 $24 = $16;
 $15 = $24;
 $25 = $15;
 $13 = $25;
 $26 = $13;
 ;HEAP8[$12>>0]=HEAP8[$14>>0]|0;
 $11 = $26;
 $27 = $11;
 $10 = $27;
 HEAP32[$19>>2] = 1073741823;
 $28 = (4294967295 / 2)&-1;
 HEAP32[$20>>2] = $28;
 $7 = $19;
 $8 = $20;
 $29 = $7;
 $30 = $8;
 ;HEAP8[$6>>0]=HEAP8[$9>>0]|0;
 $4 = $29;
 $5 = $30;
 $31 = $5;
 $32 = $4;
 $1 = $6;
 $2 = $31;
 $3 = $32;
 $33 = $2;
 $34 = HEAP32[$33>>2]|0;
 $35 = $3;
 $36 = HEAP32[$35>>2]|0;
 $37 = ($34>>>0)<($36>>>0);
 $38 = $5;
 $39 = $4;
 $40 = $37 ? $38 : $39;
 $41 = HEAP32[$40>>2]|0;
 STACKTOP = sp;return ($41|0);
}
function __ZNKSt3__26vectorIfNS_9allocatorIfEEE14__annotate_newEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $20 = $0;
 $21 = $1;
 $22 = $20;
 $19 = $22;
 $23 = $19;
 $24 = HEAP32[$23>>2]|0;
 $18 = $24;
 $25 = $18;
 $17 = $22;
 $26 = $17;
 $27 = HEAP32[$26>>2]|0;
 $16 = $27;
 $28 = $16;
 $6 = $22;
 $29 = $6;
 $5 = $29;
 $30 = $5;
 $4 = $30;
 $31 = $4;
 $32 = ((($31)) + 8|0);
 $3 = $32;
 $33 = $3;
 $2 = $33;
 $34 = $2;
 $35 = HEAP32[$34>>2]|0;
 $36 = HEAP32[$30>>2]|0;
 $37 = $35;
 $38 = $36;
 $39 = (($37) - ($38))|0;
 $40 = (($39|0) / 4)&-1;
 $41 = (($28) + ($40<<2)|0);
 $8 = $22;
 $42 = $8;
 $43 = HEAP32[$42>>2]|0;
 $7 = $43;
 $44 = $7;
 $13 = $22;
 $45 = $13;
 $12 = $45;
 $46 = $12;
 $11 = $46;
 $47 = $11;
 $48 = ((($47)) + 8|0);
 $10 = $48;
 $49 = $10;
 $9 = $49;
 $50 = $9;
 $51 = HEAP32[$50>>2]|0;
 $52 = HEAP32[$46>>2]|0;
 $53 = $51;
 $54 = $52;
 $55 = (($53) - ($54))|0;
 $56 = (($55|0) / 4)&-1;
 $57 = (($44) + ($56<<2)|0);
 $15 = $22;
 $58 = $15;
 $59 = HEAP32[$58>>2]|0;
 $14 = $59;
 $60 = $14;
 $61 = $21;
 $62 = (($60) + ($61<<2)|0);
 __ZNKSt3__26vectorIfNS_9allocatorIfEEE31__annotate_contiguous_containerEPKvS5_S5_S5_($22,$25,$41,$57,$62);
 STACKTOP = sp;return;
}
function __ZNKSt3__26vectorIfNS_9allocatorIfEEE31__annotate_contiguous_containerEPKvS5_S5_S5_($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $8 = $3;
 $9 = $4;
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorIfNS_9allocatorIfEEE24__RAII_IncreaseAnnotatorC2ERKS3_j($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorIfNS_9allocatorIfEEE24__RAII_IncreaseAnnotator6__doneEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorIfNS_9allocatorIfEEE18__construct_at_endIPfEENS_9enable_ifIXsr21__is_forward_iteratorIT_EE5valueEvE4typeES7_S7_j($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $17 = sp + 52|0;
 $12 = $0;
 $13 = $1;
 $14 = $2;
 $15 = $3;
 $18 = $12;
 $11 = $18;
 $19 = $11;
 $20 = ((($19)) + 8|0);
 $10 = $20;
 $21 = $10;
 $9 = $21;
 $22 = $9;
 $16 = $22;
 $23 = $15;
 __ZNSt3__26vectorIfNS_9allocatorIfEEE24__RAII_IncreaseAnnotatorC2ERKS3_j($17,$18,$23);
 $24 = $16;
 $25 = $13;
 $26 = $14;
 $27 = ((($18)) + 4|0);
 $4 = $24;
 $5 = $25;
 $6 = $26;
 $7 = $27;
 $28 = $6;
 $29 = $5;
 $30 = $28;
 $31 = $29;
 $32 = (($30) - ($31))|0;
 $33 = (($32|0) / 4)&-1;
 $8 = $33;
 $34 = $8;
 $35 = ($34|0)>(0);
 if (!($35)) {
  __ZNSt3__26vectorIfNS_9allocatorIfEEE24__RAII_IncreaseAnnotator6__doneEv($17);
  STACKTOP = sp;return;
 }
 $36 = $7;
 $37 = HEAP32[$36>>2]|0;
 $38 = $5;
 $39 = $8;
 $40 = $39<<2;
 _memcpy(($37|0),($38|0),($40|0))|0;
 $41 = $8;
 $42 = $7;
 $43 = HEAP32[$42>>2]|0;
 $44 = (($43) + ($41<<2)|0);
 HEAP32[$42>>2] = $44;
 __ZNSt3__26vectorIfNS_9allocatorIfEEE24__RAII_IncreaseAnnotator6__doneEv($17);
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE8allocateEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $15 = $0;
 $16 = $1;
 $17 = $15;
 $18 = $16;
 $19 = (__ZNKSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE8max_sizeEv($17)|0);
 $20 = ($18>>>0)>($19>>>0);
 if ($20) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($17);
  // unreachable;
 }
 $14 = $17;
 $21 = $14;
 $22 = ((($21)) + 8|0);
 $13 = $22;
 $23 = $13;
 $12 = $23;
 $24 = $12;
 $25 = $16;
 $10 = $24;
 $11 = $25;
 $26 = $10;
 $27 = $11;
 $7 = $26;
 $8 = $27;
 $9 = 0;
 $28 = $7;
 $29 = $8;
 $6 = $28;
 $30 = ($29>>>0)>(357913941);
 if ($30) {
  $31 = (___cxa_allocate_exception(4)|0);
  __ZNSt9bad_allocC2Ev($31);
  ___cxa_throw(($31|0),(360|0),(18|0));
  // unreachable;
 } else {
  $32 = $8;
  $33 = ($32*12)|0;
  $5 = $33;
  $34 = $5;
  $35 = (__Znwj($34)|0);
  $36 = ((($17)) + 4|0);
  HEAP32[$36>>2] = $35;
  HEAP32[$17>>2] = $35;
  $37 = HEAP32[$17>>2]|0;
  $38 = $16;
  $39 = (($37) + (($38*12)|0)|0);
  $4 = $17;
  $40 = $4;
  $41 = ((($40)) + 8|0);
  $3 = $41;
  $42 = $3;
  $2 = $42;
  $43 = $2;
  HEAP32[$43>>2] = $39;
  __ZNKSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE14__annotate_newEj($17,0);
  STACKTOP = sp;return;
 }
}
function __ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE18__construct_at_endIPKS3_EENS_9enable_ifIXsr21__is_forward_iteratorIT_EE5valueEvE4typeESA_SA_j($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 112|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(112|0);
 $12 = sp;
 $17 = sp + 105|0;
 $31 = sp + 104|0;
 $26 = $0;
 $27 = $1;
 $28 = $2;
 $29 = $3;
 $32 = $26;
 $25 = $32;
 $33 = $25;
 $34 = ((($33)) + 8|0);
 $24 = $34;
 $35 = $24;
 $23 = $35;
 $36 = $23;
 $30 = $36;
 $37 = $29;
 __ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE24__RAII_IncreaseAnnotatorC2ERKS5_j($31,$32,$37);
 $38 = $30;
 $39 = $27;
 $40 = $28;
 $41 = ((($32)) + 4|0);
 $19 = $38;
 $20 = $39;
 $21 = $40;
 $22 = $41;
 while(1) {
  $42 = $20;
  $43 = $21;
  $44 = ($42|0)!=($43|0);
  if (!($44)) {
   break;
  }
  $45 = $19;
  $46 = $22;
  $47 = HEAP32[$46>>2]|0;
  $18 = $47;
  $48 = $18;
  $49 = $20;
  $14 = $45;
  $15 = $48;
  $16 = $49;
  $50 = $14;
  $51 = $15;
  $52 = $16;
  $13 = $52;
  $53 = $13;
  ;HEAP8[$12>>0]=HEAP8[$17>>0]|0;
  $9 = $50;
  $10 = $51;
  $11 = $53;
  $54 = $9;
  $55 = $10;
  $56 = $11;
  $8 = $56;
  $57 = $8;
  $5 = $54;
  $6 = $55;
  $7 = $57;
  $58 = $6;
  $59 = $7;
  $4 = $59;
  $60 = $4;
  __ZNSt3__26vectorIfNS_9allocatorIfEEEC2ERKS3_($58,$60);
  $61 = $20;
  $62 = ((($61)) + 12|0);
  $20 = $62;
  $63 = $22;
  $64 = HEAP32[$63>>2]|0;
  $65 = ((($64)) + 12|0);
  HEAP32[$63>>2] = $65;
 }
 __ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE24__RAII_IncreaseAnnotator6__doneEv($31);
 STACKTOP = sp;return;
}
function __ZNKSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE8max_sizeEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $6 = sp + 8|0;
 $9 = sp + 77|0;
 $12 = sp;
 $14 = sp + 76|0;
 $19 = sp + 16|0;
 $20 = sp + 12|0;
 $18 = $0;
 $21 = $18;
 $17 = $21;
 $22 = $17;
 $23 = ((($22)) + 8|0);
 $16 = $23;
 $24 = $16;
 $15 = $24;
 $25 = $15;
 $13 = $25;
 $26 = $13;
 ;HEAP8[$12>>0]=HEAP8[$14>>0]|0;
 $11 = $26;
 $27 = $11;
 $10 = $27;
 HEAP32[$19>>2] = 357913941;
 $28 = (4294967295 / 2)&-1;
 HEAP32[$20>>2] = $28;
 $7 = $19;
 $8 = $20;
 $29 = $7;
 $30 = $8;
 ;HEAP8[$6>>0]=HEAP8[$9>>0]|0;
 $4 = $29;
 $5 = $30;
 $31 = $5;
 $32 = $4;
 $1 = $6;
 $2 = $31;
 $3 = $32;
 $33 = $2;
 $34 = HEAP32[$33>>2]|0;
 $35 = $3;
 $36 = HEAP32[$35>>2]|0;
 $37 = ($34>>>0)<($36>>>0);
 $38 = $5;
 $39 = $4;
 $40 = $37 ? $38 : $39;
 $41 = HEAP32[$40>>2]|0;
 STACKTOP = sp;return ($41|0);
}
function __ZNKSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE14__annotate_newEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $20 = $0;
 $21 = $1;
 $22 = $20;
 $19 = $22;
 $23 = $19;
 $24 = HEAP32[$23>>2]|0;
 $18 = $24;
 $25 = $18;
 $17 = $22;
 $26 = $17;
 $27 = HEAP32[$26>>2]|0;
 $16 = $27;
 $28 = $16;
 $6 = $22;
 $29 = $6;
 $5 = $29;
 $30 = $5;
 $4 = $30;
 $31 = $4;
 $32 = ((($31)) + 8|0);
 $3 = $32;
 $33 = $3;
 $2 = $33;
 $34 = $2;
 $35 = HEAP32[$34>>2]|0;
 $36 = HEAP32[$30>>2]|0;
 $37 = $35;
 $38 = $36;
 $39 = (($37) - ($38))|0;
 $40 = (($39|0) / 12)&-1;
 $41 = (($28) + (($40*12)|0)|0);
 $8 = $22;
 $42 = $8;
 $43 = HEAP32[$42>>2]|0;
 $7 = $43;
 $44 = $7;
 $13 = $22;
 $45 = $13;
 $12 = $45;
 $46 = $12;
 $11 = $46;
 $47 = $11;
 $48 = ((($47)) + 8|0);
 $10 = $48;
 $49 = $10;
 $9 = $49;
 $50 = $9;
 $51 = HEAP32[$50>>2]|0;
 $52 = HEAP32[$46>>2]|0;
 $53 = $51;
 $54 = $52;
 $55 = (($53) - ($54))|0;
 $56 = (($55|0) / 12)&-1;
 $57 = (($44) + (($56*12)|0)|0);
 $15 = $22;
 $58 = $15;
 $59 = HEAP32[$58>>2]|0;
 $14 = $59;
 $60 = $14;
 $61 = $21;
 $62 = (($60) + (($61*12)|0)|0);
 __ZNKSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE31__annotate_contiguous_containerEPKvS7_S7_S7_($22,$25,$41,$57,$62);
 STACKTOP = sp;return;
}
function __ZNKSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE31__annotate_contiguous_containerEPKvS7_S7_S7_($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $8 = $3;
 $9 = $4;
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE24__RAII_IncreaseAnnotatorC2ERKS5_j($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE24__RAII_IncreaseAnnotator6__doneEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return;
}
function __ZNSt3__211char_traitsIcE6lengthEPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = (_strlen($2)|0);
 STACKTOP = sp;return ($3|0);
}
function __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE21__push_back_slow_pathIS3_EEvOT_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0;
 var $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0;
 var $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0;
 var $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0;
 var $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 336|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(336|0);
 $6 = sp + 300|0;
 $7 = sp + 24|0;
 $10 = sp + 288|0;
 $11 = sp + 323|0;
 $12 = sp + 16|0;
 $16 = sp + 322|0;
 $40 = sp + 8|0;
 $45 = sp + 321|0;
 $54 = sp;
 $57 = sp + 320|0;
 $65 = sp + 96|0;
 $68 = sp + 84|0;
 $76 = sp + 36|0;
 $73 = $0;
 $74 = $1;
 $79 = $73;
 $72 = $79;
 $80 = $72;
 $81 = ((($80)) + 8|0);
 $71 = $81;
 $82 = $71;
 $70 = $82;
 $83 = $70;
 $75 = $83;
 $69 = $79;
 $84 = $69;
 $85 = ((($84)) + 4|0);
 $86 = HEAP32[$85>>2]|0;
 $87 = HEAP32[$84>>2]|0;
 $88 = $86;
 $89 = $87;
 $90 = (($88) - ($89))|0;
 $91 = (($90|0) / 12)&-1;
 $92 = (($91) + 1)|0;
 $64 = $79;
 HEAP32[$65>>2] = $92;
 $93 = $64;
 $94 = (__ZNKSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE8max_sizeEv($93)|0);
 $66 = $94;
 $95 = HEAP32[$65>>2]|0;
 $96 = $66;
 $97 = ($95>>>0)>($96>>>0);
 if ($97) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($93);
  // unreachable;
 }
 $62 = $93;
 $98 = $62;
 $61 = $98;
 $99 = $61;
 $60 = $99;
 $100 = $60;
 $101 = ((($100)) + 8|0);
 $59 = $101;
 $102 = $59;
 $58 = $102;
 $103 = $58;
 $104 = HEAP32[$103>>2]|0;
 $105 = HEAP32[$99>>2]|0;
 $106 = $104;
 $107 = $105;
 $108 = (($106) - ($107))|0;
 $109 = (($108|0) / 12)&-1;
 $67 = $109;
 $110 = $67;
 $111 = $66;
 $112 = (($111>>>0) / 2)&-1;
 $113 = ($110>>>0)>=($112>>>0);
 if ($113) {
  $114 = $66;
  $63 = $114;
 } else {
  $115 = $67;
  $116 = $115<<1;
  HEAP32[$68>>2] = $116;
  $55 = $68;
  $56 = $65;
  $117 = $55;
  $118 = $56;
  ;HEAP8[$54>>0]=HEAP8[$57>>0]|0;
  $52 = $117;
  $53 = $118;
  $119 = $52;
  $120 = $53;
  $49 = $54;
  $50 = $119;
  $51 = $120;
  $121 = $50;
  $122 = HEAP32[$121>>2]|0;
  $123 = $51;
  $124 = HEAP32[$123>>2]|0;
  $125 = ($122>>>0)<($124>>>0);
  $126 = $53;
  $127 = $52;
  $128 = $125 ? $126 : $127;
  $129 = HEAP32[$128>>2]|0;
  $63 = $129;
 }
 $130 = $63;
 $48 = $79;
 $131 = $48;
 $132 = ((($131)) + 4|0);
 $133 = HEAP32[$132>>2]|0;
 $134 = HEAP32[$131>>2]|0;
 $135 = $133;
 $136 = $134;
 $137 = (($135) - ($136))|0;
 $138 = (($137|0) / 12)&-1;
 $139 = $75;
 __ZNSt3__214__split_bufferINS_6vectorIiNS_9allocatorIiEEEERNS2_IS4_EEEC2EjjS6_($76,$130,$138,$139);
 $140 = $75;
 $141 = ((($76)) + 8|0);
 $142 = HEAP32[$141>>2]|0;
 $47 = $142;
 $143 = $47;
 $144 = $74;
 $46 = $144;
 $145 = $46;
 $42 = $140;
 $43 = $143;
 $44 = $145;
 $146 = $42;
 $147 = $43;
 $148 = $44;
 $41 = $148;
 $149 = $41;
 ;HEAP8[$40>>0]=HEAP8[$45>>0]|0;
 $37 = $146;
 $38 = $147;
 $39 = $149;
 $150 = $37;
 $151 = $38;
 $152 = $39;
 $36 = $152;
 $153 = $36;
 $33 = $150;
 $34 = $151;
 $35 = $153;
 $154 = $34;
 $155 = $35;
 $32 = $155;
 $156 = $32;
 $30 = $154;
 $31 = $156;
 $157 = $30;
 $158 = $31;
 $29 = $158;
 $159 = $29;
 $160 = ((($159)) + 8|0);
 $28 = $160;
 $161 = $28;
 $27 = $161;
 $162 = $27;
 $26 = $162;
 $163 = $26;
 $14 = $157;
 $15 = $163;
 $164 = $14;
 $13 = $164;
 HEAP32[$164>>2] = 0;
 $165 = ((($164)) + 4|0);
 HEAP32[$165>>2] = 0;
 $166 = ((($164)) + 8|0);
 ;HEAP8[$12>>0]=HEAP8[$16>>0]|0;
 $9 = $166;
 HEAP32[$10>>2] = 0;
 $167 = $9;
 $8 = $10;
 $168 = $8;
 $169 = HEAP32[$168>>2]|0;
 $2 = $12;
 ;HEAP8[$7>>0]=HEAP8[$11>>0]|0;
 $5 = $167;
 HEAP32[$6>>2] = $169;
 $170 = $5;
 $4 = $7;
 $3 = $6;
 $171 = $3;
 $172 = HEAP32[$171>>2]|0;
 HEAP32[$170>>2] = $172;
 $173 = $31;
 $174 = HEAP32[$173>>2]|0;
 HEAP32[$157>>2] = $174;
 $175 = $31;
 $176 = ((($175)) + 4|0);
 $177 = HEAP32[$176>>2]|0;
 $178 = ((($157)) + 4|0);
 HEAP32[$178>>2] = $177;
 $179 = $31;
 $19 = $179;
 $180 = $19;
 $181 = ((($180)) + 8|0);
 $18 = $181;
 $182 = $18;
 $17 = $182;
 $183 = $17;
 $184 = HEAP32[$183>>2]|0;
 $22 = $157;
 $185 = $22;
 $186 = ((($185)) + 8|0);
 $21 = $186;
 $187 = $21;
 $20 = $187;
 $188 = $20;
 HEAP32[$188>>2] = $184;
 $189 = $31;
 $25 = $189;
 $190 = $25;
 $191 = ((($190)) + 8|0);
 $24 = $191;
 $192 = $24;
 $23 = $192;
 $193 = $23;
 HEAP32[$193>>2] = 0;
 $194 = $31;
 $195 = ((($194)) + 4|0);
 HEAP32[$195>>2] = 0;
 $196 = $31;
 HEAP32[$196>>2] = 0;
 $197 = ((($76)) + 8|0);
 $198 = HEAP32[$197>>2]|0;
 $199 = ((($198)) + 12|0);
 HEAP32[$197>>2] = $199;
 __THREW__ = 0;
 invoke_vii(105,($79|0),($76|0));
 $200 = __THREW__; __THREW__ = 0;
 $201 = $200&1;
 if ($201) {
  $202 = ___cxa_find_matching_catch_2()|0;
  $203 = tempRet0;
  $77 = $202;
  $78 = $203;
  __ZNSt3__214__split_bufferINS_6vectorIiNS_9allocatorIiEEEERNS2_IS4_EEED2Ev($76);
  $204 = $77;
  $205 = $78;
  ___resumeException($204|0);
  // unreachable;
 } else {
  __ZNSt3__214__split_bufferINS_6vectorIiNS_9allocatorIiEEEERNS2_IS4_EEED2Ev($76);
  STACKTOP = sp;return;
 }
}
function __ZNSt3__214__split_bufferINS_6vectorIiNS_9allocatorIiEEEERNS2_IS4_EEEC2EjjS6_($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 112|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(112|0);
 $21 = sp + 36|0;
 $25 = sp + 20|0;
 $27 = $0;
 $28 = $1;
 $29 = $2;
 $30 = $3;
 $31 = $27;
 $32 = ((($31)) + 12|0);
 $33 = $30;
 $24 = $32;
 HEAP32[$25>>2] = 0;
 $26 = $33;
 $34 = $24;
 $23 = $25;
 $35 = $23;
 $36 = HEAP32[$35>>2]|0;
 $37 = $26;
 $17 = $37;
 $38 = $17;
 $20 = $34;
 HEAP32[$21>>2] = $36;
 $22 = $38;
 $39 = $20;
 $19 = $21;
 $40 = $19;
 $41 = HEAP32[$40>>2]|0;
 HEAP32[$39>>2] = $41;
 $42 = ((($39)) + 4|0);
 $43 = $22;
 $18 = $43;
 $44 = $18;
 HEAP32[$42>>2] = $44;
 $45 = $28;
 $46 = ($45|0)!=(0);
 do {
  if ($46) {
   $6 = $31;
   $47 = $6;
   $48 = ((($47)) + 12|0);
   $5 = $48;
   $49 = $5;
   $4 = $49;
   $50 = $4;
   $51 = ((($50)) + 4|0);
   $52 = HEAP32[$51>>2]|0;
   $53 = $28;
   $12 = $52;
   $13 = $53;
   $54 = $12;
   $55 = $13;
   $9 = $54;
   $10 = $55;
   $11 = 0;
   $56 = $9;
   $57 = $10;
   $8 = $56;
   $58 = ($57>>>0)>(357913941);
   if ($58) {
    $59 = (___cxa_allocate_exception(4)|0);
    __ZNSt9bad_allocC2Ev($59);
    ___cxa_throw(($59|0),(360|0),(18|0));
    // unreachable;
   } else {
    $60 = $10;
    $61 = ($60*12)|0;
    $7 = $61;
    $62 = $7;
    $63 = (__Znwj($62)|0);
    $64 = $63;
    break;
   }
  } else {
   $64 = 0;
  }
 } while(0);
 HEAP32[$31>>2] = $64;
 $65 = HEAP32[$31>>2]|0;
 $66 = $29;
 $67 = (($65) + (($66*12)|0)|0);
 $68 = ((($31)) + 8|0);
 HEAP32[$68>>2] = $67;
 $69 = ((($31)) + 4|0);
 HEAP32[$69>>2] = $67;
 $70 = HEAP32[$31>>2]|0;
 $71 = $28;
 $72 = (($70) + (($71*12)|0)|0);
 $16 = $31;
 $73 = $16;
 $74 = ((($73)) + 12|0);
 $15 = $74;
 $75 = $15;
 $14 = $75;
 $76 = $14;
 HEAP32[$76>>2] = $72;
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE26__swap_out_circular_bufferERNS_14__split_bufferIS3_RS4_EE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0;
 var $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0;
 var $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0;
 var $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0;
 var $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0;
 var $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0;
 var $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 336|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(336|0);
 $7 = sp + 300|0;
 $13 = sp + 276|0;
 $25 = sp + 228|0;
 $33 = sp + 196|0;
 $34 = sp + 16|0;
 $37 = sp + 184|0;
 $38 = sp + 326|0;
 $39 = sp + 8|0;
 $43 = sp + 325|0;
 $67 = sp;
 $72 = sp + 324|0;
 $82 = $0;
 $83 = $1;
 $84 = $82;
 __ZNKSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE17__annotate_deleteEv($84);
 $81 = $84;
 $85 = $81;
 $86 = ((($85)) + 8|0);
 $80 = $86;
 $87 = $80;
 $79 = $87;
 $88 = $79;
 $89 = HEAP32[$84>>2]|0;
 $90 = ((($84)) + 4|0);
 $91 = HEAP32[$90>>2]|0;
 $92 = $83;
 $93 = ((($92)) + 4|0);
 $74 = $88;
 $75 = $89;
 $76 = $91;
 $77 = $93;
 while(1) {
  $94 = $76;
  $95 = $75;
  $96 = ($94|0)!=($95|0);
  if (!($96)) {
   break;
  }
  $97 = $74;
  $98 = $77;
  $99 = HEAP32[$98>>2]|0;
  $100 = ((($99)) + -12|0);
  $73 = $100;
  $101 = $73;
  $102 = $76;
  $103 = ((($102)) + -12|0);
  $76 = $103;
  $28 = $103;
  $104 = $28;
  $27 = $104;
  $105 = $27;
  $69 = $97;
  $70 = $101;
  $71 = $105;
  $106 = $69;
  $107 = $70;
  $108 = $71;
  $68 = $108;
  $109 = $68;
  ;HEAP8[$67>>0]=HEAP8[$72>>0]|0;
  $64 = $106;
  $65 = $107;
  $66 = $109;
  $110 = $64;
  $111 = $65;
  $112 = $66;
  $63 = $112;
  $113 = $63;
  $60 = $110;
  $61 = $111;
  $62 = $113;
  $114 = $61;
  $115 = $62;
  $59 = $115;
  $116 = $59;
  $57 = $114;
  $58 = $116;
  $117 = $57;
  $118 = $58;
  $56 = $118;
  $119 = $56;
  $120 = ((($119)) + 8|0);
  $55 = $120;
  $121 = $55;
  $54 = $121;
  $122 = $54;
  $53 = $122;
  $123 = $53;
  $41 = $117;
  $42 = $123;
  $124 = $41;
  $40 = $124;
  HEAP32[$124>>2] = 0;
  $125 = ((($124)) + 4|0);
  HEAP32[$125>>2] = 0;
  $126 = ((($124)) + 8|0);
  ;HEAP8[$39>>0]=HEAP8[$43>>0]|0;
  $36 = $126;
  HEAP32[$37>>2] = 0;
  $127 = $36;
  $35 = $37;
  $128 = $35;
  $129 = HEAP32[$128>>2]|0;
  $29 = $39;
  ;HEAP8[$34>>0]=HEAP8[$38>>0]|0;
  $32 = $127;
  HEAP32[$33>>2] = $129;
  $130 = $32;
  $31 = $34;
  $30 = $33;
  $131 = $30;
  $132 = HEAP32[$131>>2]|0;
  HEAP32[$130>>2] = $132;
  $133 = $58;
  $134 = HEAP32[$133>>2]|0;
  HEAP32[$117>>2] = $134;
  $135 = $58;
  $136 = ((($135)) + 4|0);
  $137 = HEAP32[$136>>2]|0;
  $138 = ((($117)) + 4|0);
  HEAP32[$138>>2] = $137;
  $139 = $58;
  $46 = $139;
  $140 = $46;
  $141 = ((($140)) + 8|0);
  $45 = $141;
  $142 = $45;
  $44 = $142;
  $143 = $44;
  $144 = HEAP32[$143>>2]|0;
  $49 = $117;
  $145 = $49;
  $146 = ((($145)) + 8|0);
  $48 = $146;
  $147 = $48;
  $47 = $147;
  $148 = $47;
  HEAP32[$148>>2] = $144;
  $149 = $58;
  $52 = $149;
  $150 = $52;
  $151 = ((($150)) + 8|0);
  $51 = $151;
  $152 = $51;
  $50 = $152;
  $153 = $50;
  HEAP32[$153>>2] = 0;
  $154 = $58;
  $155 = ((($154)) + 4|0);
  HEAP32[$155>>2] = 0;
  $156 = $58;
  HEAP32[$156>>2] = 0;
  $157 = $77;
  $158 = HEAP32[$157>>2]|0;
  $159 = ((($158)) + -12|0);
  HEAP32[$157>>2] = $159;
 }
 $160 = $83;
 $161 = ((($160)) + 4|0);
 $5 = $84;
 $6 = $161;
 $162 = $5;
 $4 = $162;
 $163 = $4;
 $164 = HEAP32[$163>>2]|0;
 HEAP32[$7>>2] = $164;
 $165 = $6;
 $2 = $165;
 $166 = $2;
 $167 = HEAP32[$166>>2]|0;
 $168 = $5;
 HEAP32[$168>>2] = $167;
 $3 = $7;
 $169 = $3;
 $170 = HEAP32[$169>>2]|0;
 $171 = $6;
 HEAP32[$171>>2] = $170;
 $172 = ((($84)) + 4|0);
 $173 = $83;
 $174 = ((($173)) + 8|0);
 $11 = $172;
 $12 = $174;
 $175 = $11;
 $10 = $175;
 $176 = $10;
 $177 = HEAP32[$176>>2]|0;
 HEAP32[$13>>2] = $177;
 $178 = $12;
 $8 = $178;
 $179 = $8;
 $180 = HEAP32[$179>>2]|0;
 $181 = $11;
 HEAP32[$181>>2] = $180;
 $9 = $13;
 $182 = $9;
 $183 = HEAP32[$182>>2]|0;
 $184 = $12;
 HEAP32[$184>>2] = $183;
 $16 = $84;
 $185 = $16;
 $186 = ((($185)) + 8|0);
 $15 = $186;
 $187 = $15;
 $14 = $187;
 $188 = $14;
 $189 = $83;
 $19 = $189;
 $190 = $19;
 $191 = ((($190)) + 12|0);
 $18 = $191;
 $192 = $18;
 $17 = $192;
 $193 = $17;
 $23 = $188;
 $24 = $193;
 $194 = $23;
 $22 = $194;
 $195 = $22;
 $196 = HEAP32[$195>>2]|0;
 HEAP32[$25>>2] = $196;
 $197 = $24;
 $20 = $197;
 $198 = $20;
 $199 = HEAP32[$198>>2]|0;
 $200 = $23;
 HEAP32[$200>>2] = $199;
 $21 = $25;
 $201 = $21;
 $202 = HEAP32[$201>>2]|0;
 $203 = $24;
 HEAP32[$203>>2] = $202;
 $204 = $83;
 $205 = ((($204)) + 4|0);
 $206 = HEAP32[$205>>2]|0;
 $207 = $83;
 HEAP32[$207>>2] = $206;
 $26 = $84;
 $208 = $26;
 $209 = ((($208)) + 4|0);
 $210 = HEAP32[$209>>2]|0;
 $211 = HEAP32[$208>>2]|0;
 $212 = $210;
 $213 = $211;
 $214 = (($212) - ($213))|0;
 $215 = (($214|0) / 12)&-1;
 __ZNKSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE14__annotate_newEj($84,$215);
 $78 = $84;
 STACKTOP = sp;return;
}
function __ZNSt3__214__split_bufferINS_6vectorIiNS_9allocatorIiEEEERNS2_IS4_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0;
 var $82 = 0, $83 = 0, $84 = 0, $85 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 144|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(144|0);
 $19 = sp + 8|0;
 $22 = sp + 133|0;
 $29 = sp;
 $32 = sp + 132|0;
 $34 = $0;
 $35 = $34;
 $33 = $35;
 $36 = $33;
 $37 = ((($36)) + 4|0);
 $38 = HEAP32[$37>>2]|0;
 $30 = $36;
 $31 = $38;
 $39 = $30;
 $40 = $31;
 ;HEAP8[$29>>0]=HEAP8[$32>>0]|0;
 $27 = $39;
 $28 = $40;
 $41 = $27;
 while(1) {
  $42 = $28;
  $43 = ((($41)) + 8|0);
  $44 = HEAP32[$43>>2]|0;
  $45 = ($42|0)!=($44|0);
  if (!($45)) {
   break;
  }
  $26 = $41;
  $46 = $26;
  $47 = ((($46)) + 12|0);
  $25 = $47;
  $48 = $25;
  $24 = $48;
  $49 = $24;
  $50 = ((($49)) + 4|0);
  $51 = HEAP32[$50>>2]|0;
  $52 = ((($41)) + 8|0);
  $53 = HEAP32[$52>>2]|0;
  $54 = ((($53)) + -12|0);
  HEAP32[$52>>2] = $54;
  $23 = $54;
  $55 = $23;
  $20 = $51;
  $21 = $55;
  $56 = $20;
  $57 = $21;
  ;HEAP8[$19>>0]=HEAP8[$22>>0]|0;
  $17 = $56;
  $18 = $57;
  $58 = $17;
  $59 = $18;
  $15 = $58;
  $16 = $59;
  $60 = $16;
  __ZNSt3__26vectorIiNS_9allocatorIiEEED2Ev($60);
 }
 $61 = HEAP32[$35>>2]|0;
 $62 = ($61|0)!=(0|0);
 if (!($62)) {
  STACKTOP = sp;return;
 }
 $14 = $35;
 $63 = $14;
 $64 = ((($63)) + 12|0);
 $13 = $64;
 $65 = $13;
 $12 = $65;
 $66 = $12;
 $67 = ((($66)) + 4|0);
 $68 = HEAP32[$67>>2]|0;
 $69 = HEAP32[$35>>2]|0;
 $11 = $35;
 $70 = $11;
 $10 = $70;
 $71 = $10;
 $72 = ((($71)) + 12|0);
 $9 = $72;
 $73 = $9;
 $8 = $73;
 $74 = $8;
 $75 = HEAP32[$74>>2]|0;
 $76 = HEAP32[$70>>2]|0;
 $77 = $75;
 $78 = $76;
 $79 = (($77) - ($78))|0;
 $80 = (($79|0) / 12)&-1;
 $5 = $68;
 $6 = $69;
 $7 = $80;
 $81 = $5;
 $82 = $6;
 $83 = $7;
 $2 = $81;
 $3 = $82;
 $4 = $83;
 $84 = $3;
 $1 = $84;
 $85 = $1;
 __ZdlPv($85);
 STACKTOP = sp;return;
}
function __ZNKSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE17__annotate_deleteEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $20 = $0;
 $21 = $20;
 $19 = $21;
 $22 = $19;
 $23 = HEAP32[$22>>2]|0;
 $18 = $23;
 $24 = $18;
 $17 = $21;
 $25 = $17;
 $26 = HEAP32[$25>>2]|0;
 $16 = $26;
 $27 = $16;
 $5 = $21;
 $28 = $5;
 $4 = $28;
 $29 = $4;
 $3 = $29;
 $30 = $3;
 $31 = ((($30)) + 8|0);
 $2 = $31;
 $32 = $2;
 $1 = $32;
 $33 = $1;
 $34 = HEAP32[$33>>2]|0;
 $35 = HEAP32[$29>>2]|0;
 $36 = $34;
 $37 = $35;
 $38 = (($36) - ($37))|0;
 $39 = (($38|0) / 12)&-1;
 $40 = (($27) + (($39*12)|0)|0);
 $7 = $21;
 $41 = $7;
 $42 = HEAP32[$41>>2]|0;
 $6 = $42;
 $43 = $6;
 $8 = $21;
 $44 = $8;
 $45 = ((($44)) + 4|0);
 $46 = HEAP32[$45>>2]|0;
 $47 = HEAP32[$44>>2]|0;
 $48 = $46;
 $49 = $47;
 $50 = (($48) - ($49))|0;
 $51 = (($50|0) / 12)&-1;
 $52 = (($43) + (($51*12)|0)|0);
 $10 = $21;
 $53 = $10;
 $54 = HEAP32[$53>>2]|0;
 $9 = $54;
 $55 = $9;
 $15 = $21;
 $56 = $15;
 $14 = $56;
 $57 = $14;
 $13 = $57;
 $58 = $13;
 $59 = ((($58)) + 8|0);
 $12 = $59;
 $60 = $12;
 $11 = $60;
 $61 = $11;
 $62 = HEAP32[$61>>2]|0;
 $63 = HEAP32[$57>>2]|0;
 $64 = $62;
 $65 = $63;
 $66 = (($64) - ($65))|0;
 $67 = (($66|0) / 12)&-1;
 $68 = (($55) + (($67*12)|0)|0);
 __ZNKSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE31__annotate_contiguous_containerEPKvS7_S7_S7_($21,$24,$40,$52,$68);
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE21__push_back_slow_pathIRKS3_EEvOT_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0;
 var $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 208|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(208|0);
 $10 = sp + 8|0;
 $15 = sp + 201|0;
 $24 = sp;
 $27 = sp + 200|0;
 $35 = sp + 80|0;
 $38 = sp + 68|0;
 $46 = sp + 20|0;
 $43 = $0;
 $44 = $1;
 $49 = $43;
 $42 = $49;
 $50 = $42;
 $51 = ((($50)) + 8|0);
 $41 = $51;
 $52 = $41;
 $40 = $52;
 $53 = $40;
 $45 = $53;
 $39 = $49;
 $54 = $39;
 $55 = ((($54)) + 4|0);
 $56 = HEAP32[$55>>2]|0;
 $57 = HEAP32[$54>>2]|0;
 $58 = $56;
 $59 = $57;
 $60 = (($58) - ($59))|0;
 $61 = (($60|0) / 12)&-1;
 $62 = (($61) + 1)|0;
 $34 = $49;
 HEAP32[$35>>2] = $62;
 $63 = $34;
 $64 = (__ZNKSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE8max_sizeEv($63)|0);
 $36 = $64;
 $65 = HEAP32[$35>>2]|0;
 $66 = $36;
 $67 = ($65>>>0)>($66>>>0);
 if ($67) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($63);
  // unreachable;
 }
 $32 = $63;
 $68 = $32;
 $31 = $68;
 $69 = $31;
 $30 = $69;
 $70 = $30;
 $71 = ((($70)) + 8|0);
 $29 = $71;
 $72 = $29;
 $28 = $72;
 $73 = $28;
 $74 = HEAP32[$73>>2]|0;
 $75 = HEAP32[$69>>2]|0;
 $76 = $74;
 $77 = $75;
 $78 = (($76) - ($77))|0;
 $79 = (($78|0) / 12)&-1;
 $37 = $79;
 $80 = $37;
 $81 = $36;
 $82 = (($81>>>0) / 2)&-1;
 $83 = ($80>>>0)>=($82>>>0);
 if ($83) {
  $84 = $36;
  $33 = $84;
 } else {
  $85 = $37;
  $86 = $85<<1;
  HEAP32[$38>>2] = $86;
  $25 = $38;
  $26 = $35;
  $87 = $25;
  $88 = $26;
  ;HEAP8[$24>>0]=HEAP8[$27>>0]|0;
  $22 = $87;
  $23 = $88;
  $89 = $22;
  $90 = $23;
  $19 = $24;
  $20 = $89;
  $21 = $90;
  $91 = $20;
  $92 = HEAP32[$91>>2]|0;
  $93 = $21;
  $94 = HEAP32[$93>>2]|0;
  $95 = ($92>>>0)<($94>>>0);
  $96 = $23;
  $97 = $22;
  $98 = $95 ? $96 : $97;
  $99 = HEAP32[$98>>2]|0;
  $33 = $99;
 }
 $100 = $33;
 $18 = $49;
 $101 = $18;
 $102 = ((($101)) + 4|0);
 $103 = HEAP32[$102>>2]|0;
 $104 = HEAP32[$101>>2]|0;
 $105 = $103;
 $106 = $104;
 $107 = (($105) - ($106))|0;
 $108 = (($107|0) / 12)&-1;
 $109 = $45;
 __ZNSt3__214__split_bufferINS_6vectorIiNS_9allocatorIiEEEERNS2_IS4_EEEC2EjjS6_($46,$100,$108,$109);
 $110 = $45;
 $111 = ((($46)) + 8|0);
 $112 = HEAP32[$111>>2]|0;
 $17 = $112;
 $113 = $17;
 $114 = $44;
 $16 = $114;
 $115 = $16;
 $12 = $110;
 $13 = $113;
 $14 = $115;
 $116 = $12;
 $117 = $13;
 $118 = $14;
 $11 = $118;
 $119 = $11;
 ;HEAP8[$10>>0]=HEAP8[$15>>0]|0;
 $7 = $116;
 $8 = $117;
 $9 = $119;
 $120 = $7;
 $121 = $8;
 $122 = $9;
 $6 = $122;
 $123 = $6;
 $3 = $120;
 $4 = $121;
 $5 = $123;
 $124 = $4;
 $125 = $5;
 $2 = $125;
 $126 = $2;
 __THREW__ = 0;
 invoke_vii(55,($124|0),($126|0));
 $127 = __THREW__; __THREW__ = 0;
 $128 = $127&1;
 if ($128) {
  $134 = ___cxa_find_matching_catch_2()|0;
  $135 = tempRet0;
  $47 = $134;
  $48 = $135;
  __ZNSt3__214__split_bufferINS_6vectorIiNS_9allocatorIiEEEERNS2_IS4_EEED2Ev($46);
  $136 = $47;
  $137 = $48;
  ___resumeException($136|0);
  // unreachable;
 }
 $129 = ((($46)) + 8|0);
 $130 = HEAP32[$129>>2]|0;
 $131 = ((($130)) + 12|0);
 HEAP32[$129>>2] = $131;
 __THREW__ = 0;
 invoke_vii(105,($49|0),($46|0));
 $132 = __THREW__; __THREW__ = 0;
 $133 = $132&1;
 if ($133) {
  $134 = ___cxa_find_matching_catch_2()|0;
  $135 = tempRet0;
  $47 = $134;
  $48 = $135;
  __ZNSt3__214__split_bufferINS_6vectorIiNS_9allocatorIiEEEERNS2_IS4_EEED2Ev($46);
  $136 = $47;
  $137 = $48;
  ___resumeException($136|0);
  // unreachable;
 } else {
  __ZNSt3__214__split_bufferINS_6vectorIiNS_9allocatorIiEEEERNS2_IS4_EEED2Ev($46);
  STACKTOP = sp;return;
 }
}
function __ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE21__push_back_slow_pathIS3_EEvOT_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0;
 var $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0;
 var $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0;
 var $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0;
 var $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 336|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(336|0);
 $6 = sp + 300|0;
 $7 = sp + 24|0;
 $10 = sp + 288|0;
 $11 = sp + 323|0;
 $12 = sp + 16|0;
 $16 = sp + 322|0;
 $40 = sp + 8|0;
 $45 = sp + 321|0;
 $54 = sp;
 $57 = sp + 320|0;
 $65 = sp + 96|0;
 $68 = sp + 84|0;
 $76 = sp + 36|0;
 $73 = $0;
 $74 = $1;
 $79 = $73;
 $72 = $79;
 $80 = $72;
 $81 = ((($80)) + 8|0);
 $71 = $81;
 $82 = $71;
 $70 = $82;
 $83 = $70;
 $75 = $83;
 $69 = $79;
 $84 = $69;
 $85 = ((($84)) + 4|0);
 $86 = HEAP32[$85>>2]|0;
 $87 = HEAP32[$84>>2]|0;
 $88 = $86;
 $89 = $87;
 $90 = (($88) - ($89))|0;
 $91 = (($90|0) / 12)&-1;
 $92 = (($91) + 1)|0;
 $64 = $79;
 HEAP32[$65>>2] = $92;
 $93 = $64;
 $94 = (__ZNKSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE8max_sizeEv($93)|0);
 $66 = $94;
 $95 = HEAP32[$65>>2]|0;
 $96 = $66;
 $97 = ($95>>>0)>($96>>>0);
 if ($97) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($93);
  // unreachable;
 }
 $62 = $93;
 $98 = $62;
 $61 = $98;
 $99 = $61;
 $60 = $99;
 $100 = $60;
 $101 = ((($100)) + 8|0);
 $59 = $101;
 $102 = $59;
 $58 = $102;
 $103 = $58;
 $104 = HEAP32[$103>>2]|0;
 $105 = HEAP32[$99>>2]|0;
 $106 = $104;
 $107 = $105;
 $108 = (($106) - ($107))|0;
 $109 = (($108|0) / 12)&-1;
 $67 = $109;
 $110 = $67;
 $111 = $66;
 $112 = (($111>>>0) / 2)&-1;
 $113 = ($110>>>0)>=($112>>>0);
 if ($113) {
  $114 = $66;
  $63 = $114;
 } else {
  $115 = $67;
  $116 = $115<<1;
  HEAP32[$68>>2] = $116;
  $55 = $68;
  $56 = $65;
  $117 = $55;
  $118 = $56;
  ;HEAP8[$54>>0]=HEAP8[$57>>0]|0;
  $52 = $117;
  $53 = $118;
  $119 = $52;
  $120 = $53;
  $49 = $54;
  $50 = $119;
  $51 = $120;
  $121 = $50;
  $122 = HEAP32[$121>>2]|0;
  $123 = $51;
  $124 = HEAP32[$123>>2]|0;
  $125 = ($122>>>0)<($124>>>0);
  $126 = $53;
  $127 = $52;
  $128 = $125 ? $126 : $127;
  $129 = HEAP32[$128>>2]|0;
  $63 = $129;
 }
 $130 = $63;
 $48 = $79;
 $131 = $48;
 $132 = ((($131)) + 4|0);
 $133 = HEAP32[$132>>2]|0;
 $134 = HEAP32[$131>>2]|0;
 $135 = $133;
 $136 = $134;
 $137 = (($135) - ($136))|0;
 $138 = (($137|0) / 12)&-1;
 $139 = $75;
 __ZNSt3__214__split_bufferINS_6vectorIfNS_9allocatorIfEEEERNS2_IS4_EEEC2EjjS6_($76,$130,$138,$139);
 $140 = $75;
 $141 = ((($76)) + 8|0);
 $142 = HEAP32[$141>>2]|0;
 $47 = $142;
 $143 = $47;
 $144 = $74;
 $46 = $144;
 $145 = $46;
 $42 = $140;
 $43 = $143;
 $44 = $145;
 $146 = $42;
 $147 = $43;
 $148 = $44;
 $41 = $148;
 $149 = $41;
 ;HEAP8[$40>>0]=HEAP8[$45>>0]|0;
 $37 = $146;
 $38 = $147;
 $39 = $149;
 $150 = $37;
 $151 = $38;
 $152 = $39;
 $36 = $152;
 $153 = $36;
 $33 = $150;
 $34 = $151;
 $35 = $153;
 $154 = $34;
 $155 = $35;
 $32 = $155;
 $156 = $32;
 $30 = $154;
 $31 = $156;
 $157 = $30;
 $158 = $31;
 $29 = $158;
 $159 = $29;
 $160 = ((($159)) + 8|0);
 $28 = $160;
 $161 = $28;
 $27 = $161;
 $162 = $27;
 $26 = $162;
 $163 = $26;
 $14 = $157;
 $15 = $163;
 $164 = $14;
 $13 = $164;
 HEAP32[$164>>2] = 0;
 $165 = ((($164)) + 4|0);
 HEAP32[$165>>2] = 0;
 $166 = ((($164)) + 8|0);
 ;HEAP8[$12>>0]=HEAP8[$16>>0]|0;
 $9 = $166;
 HEAP32[$10>>2] = 0;
 $167 = $9;
 $8 = $10;
 $168 = $8;
 $169 = HEAP32[$168>>2]|0;
 $2 = $12;
 ;HEAP8[$7>>0]=HEAP8[$11>>0]|0;
 $5 = $167;
 HEAP32[$6>>2] = $169;
 $170 = $5;
 $4 = $7;
 $3 = $6;
 $171 = $3;
 $172 = HEAP32[$171>>2]|0;
 HEAP32[$170>>2] = $172;
 $173 = $31;
 $174 = HEAP32[$173>>2]|0;
 HEAP32[$157>>2] = $174;
 $175 = $31;
 $176 = ((($175)) + 4|0);
 $177 = HEAP32[$176>>2]|0;
 $178 = ((($157)) + 4|0);
 HEAP32[$178>>2] = $177;
 $179 = $31;
 $19 = $179;
 $180 = $19;
 $181 = ((($180)) + 8|0);
 $18 = $181;
 $182 = $18;
 $17 = $182;
 $183 = $17;
 $184 = HEAP32[$183>>2]|0;
 $22 = $157;
 $185 = $22;
 $186 = ((($185)) + 8|0);
 $21 = $186;
 $187 = $21;
 $20 = $187;
 $188 = $20;
 HEAP32[$188>>2] = $184;
 $189 = $31;
 $25 = $189;
 $190 = $25;
 $191 = ((($190)) + 8|0);
 $24 = $191;
 $192 = $24;
 $23 = $192;
 $193 = $23;
 HEAP32[$193>>2] = 0;
 $194 = $31;
 $195 = ((($194)) + 4|0);
 HEAP32[$195>>2] = 0;
 $196 = $31;
 HEAP32[$196>>2] = 0;
 $197 = ((($76)) + 8|0);
 $198 = HEAP32[$197>>2]|0;
 $199 = ((($198)) + 12|0);
 HEAP32[$197>>2] = $199;
 __THREW__ = 0;
 invoke_vii(106,($79|0),($76|0));
 $200 = __THREW__; __THREW__ = 0;
 $201 = $200&1;
 if ($201) {
  $202 = ___cxa_find_matching_catch_2()|0;
  $203 = tempRet0;
  $77 = $202;
  $78 = $203;
  __ZNSt3__214__split_bufferINS_6vectorIfNS_9allocatorIfEEEERNS2_IS4_EEED2Ev($76);
  $204 = $77;
  $205 = $78;
  ___resumeException($204|0);
  // unreachable;
 } else {
  __ZNSt3__214__split_bufferINS_6vectorIfNS_9allocatorIfEEEERNS2_IS4_EEED2Ev($76);
  STACKTOP = sp;return;
 }
}
function __ZNSt3__214__split_bufferINS_6vectorIfNS_9allocatorIfEEEERNS2_IS4_EEEC2EjjS6_($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 112|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(112|0);
 $21 = sp + 36|0;
 $25 = sp + 20|0;
 $27 = $0;
 $28 = $1;
 $29 = $2;
 $30 = $3;
 $31 = $27;
 $32 = ((($31)) + 12|0);
 $33 = $30;
 $24 = $32;
 HEAP32[$25>>2] = 0;
 $26 = $33;
 $34 = $24;
 $23 = $25;
 $35 = $23;
 $36 = HEAP32[$35>>2]|0;
 $37 = $26;
 $17 = $37;
 $38 = $17;
 $20 = $34;
 HEAP32[$21>>2] = $36;
 $22 = $38;
 $39 = $20;
 $19 = $21;
 $40 = $19;
 $41 = HEAP32[$40>>2]|0;
 HEAP32[$39>>2] = $41;
 $42 = ((($39)) + 4|0);
 $43 = $22;
 $18 = $43;
 $44 = $18;
 HEAP32[$42>>2] = $44;
 $45 = $28;
 $46 = ($45|0)!=(0);
 do {
  if ($46) {
   $6 = $31;
   $47 = $6;
   $48 = ((($47)) + 12|0);
   $5 = $48;
   $49 = $5;
   $4 = $49;
   $50 = $4;
   $51 = ((($50)) + 4|0);
   $52 = HEAP32[$51>>2]|0;
   $53 = $28;
   $12 = $52;
   $13 = $53;
   $54 = $12;
   $55 = $13;
   $9 = $54;
   $10 = $55;
   $11 = 0;
   $56 = $9;
   $57 = $10;
   $8 = $56;
   $58 = ($57>>>0)>(357913941);
   if ($58) {
    $59 = (___cxa_allocate_exception(4)|0);
    __ZNSt9bad_allocC2Ev($59);
    ___cxa_throw(($59|0),(360|0),(18|0));
    // unreachable;
   } else {
    $60 = $10;
    $61 = ($60*12)|0;
    $7 = $61;
    $62 = $7;
    $63 = (__Znwj($62)|0);
    $64 = $63;
    break;
   }
  } else {
   $64 = 0;
  }
 } while(0);
 HEAP32[$31>>2] = $64;
 $65 = HEAP32[$31>>2]|0;
 $66 = $29;
 $67 = (($65) + (($66*12)|0)|0);
 $68 = ((($31)) + 8|0);
 HEAP32[$68>>2] = $67;
 $69 = ((($31)) + 4|0);
 HEAP32[$69>>2] = $67;
 $70 = HEAP32[$31>>2]|0;
 $71 = $28;
 $72 = (($70) + (($71*12)|0)|0);
 $16 = $31;
 $73 = $16;
 $74 = ((($73)) + 12|0);
 $15 = $74;
 $75 = $15;
 $14 = $75;
 $76 = $14;
 HEAP32[$76>>2] = $72;
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE26__swap_out_circular_bufferERNS_14__split_bufferIS3_RS4_EE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0;
 var $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0;
 var $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0;
 var $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0;
 var $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0;
 var $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0;
 var $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 336|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(336|0);
 $7 = sp + 300|0;
 $13 = sp + 276|0;
 $25 = sp + 228|0;
 $33 = sp + 196|0;
 $34 = sp + 16|0;
 $37 = sp + 184|0;
 $38 = sp + 326|0;
 $39 = sp + 8|0;
 $43 = sp + 325|0;
 $67 = sp;
 $72 = sp + 324|0;
 $82 = $0;
 $83 = $1;
 $84 = $82;
 __ZNKSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE17__annotate_deleteEv($84);
 $81 = $84;
 $85 = $81;
 $86 = ((($85)) + 8|0);
 $80 = $86;
 $87 = $80;
 $79 = $87;
 $88 = $79;
 $89 = HEAP32[$84>>2]|0;
 $90 = ((($84)) + 4|0);
 $91 = HEAP32[$90>>2]|0;
 $92 = $83;
 $93 = ((($92)) + 4|0);
 $74 = $88;
 $75 = $89;
 $76 = $91;
 $77 = $93;
 while(1) {
  $94 = $76;
  $95 = $75;
  $96 = ($94|0)!=($95|0);
  if (!($96)) {
   break;
  }
  $97 = $74;
  $98 = $77;
  $99 = HEAP32[$98>>2]|0;
  $100 = ((($99)) + -12|0);
  $73 = $100;
  $101 = $73;
  $102 = $76;
  $103 = ((($102)) + -12|0);
  $76 = $103;
  $28 = $103;
  $104 = $28;
  $27 = $104;
  $105 = $27;
  $69 = $97;
  $70 = $101;
  $71 = $105;
  $106 = $69;
  $107 = $70;
  $108 = $71;
  $68 = $108;
  $109 = $68;
  ;HEAP8[$67>>0]=HEAP8[$72>>0]|0;
  $64 = $106;
  $65 = $107;
  $66 = $109;
  $110 = $64;
  $111 = $65;
  $112 = $66;
  $63 = $112;
  $113 = $63;
  $60 = $110;
  $61 = $111;
  $62 = $113;
  $114 = $61;
  $115 = $62;
  $59 = $115;
  $116 = $59;
  $57 = $114;
  $58 = $116;
  $117 = $57;
  $118 = $58;
  $56 = $118;
  $119 = $56;
  $120 = ((($119)) + 8|0);
  $55 = $120;
  $121 = $55;
  $54 = $121;
  $122 = $54;
  $53 = $122;
  $123 = $53;
  $41 = $117;
  $42 = $123;
  $124 = $41;
  $40 = $124;
  HEAP32[$124>>2] = 0;
  $125 = ((($124)) + 4|0);
  HEAP32[$125>>2] = 0;
  $126 = ((($124)) + 8|0);
  ;HEAP8[$39>>0]=HEAP8[$43>>0]|0;
  $36 = $126;
  HEAP32[$37>>2] = 0;
  $127 = $36;
  $35 = $37;
  $128 = $35;
  $129 = HEAP32[$128>>2]|0;
  $29 = $39;
  ;HEAP8[$34>>0]=HEAP8[$38>>0]|0;
  $32 = $127;
  HEAP32[$33>>2] = $129;
  $130 = $32;
  $31 = $34;
  $30 = $33;
  $131 = $30;
  $132 = HEAP32[$131>>2]|0;
  HEAP32[$130>>2] = $132;
  $133 = $58;
  $134 = HEAP32[$133>>2]|0;
  HEAP32[$117>>2] = $134;
  $135 = $58;
  $136 = ((($135)) + 4|0);
  $137 = HEAP32[$136>>2]|0;
  $138 = ((($117)) + 4|0);
  HEAP32[$138>>2] = $137;
  $139 = $58;
  $46 = $139;
  $140 = $46;
  $141 = ((($140)) + 8|0);
  $45 = $141;
  $142 = $45;
  $44 = $142;
  $143 = $44;
  $144 = HEAP32[$143>>2]|0;
  $49 = $117;
  $145 = $49;
  $146 = ((($145)) + 8|0);
  $48 = $146;
  $147 = $48;
  $47 = $147;
  $148 = $47;
  HEAP32[$148>>2] = $144;
  $149 = $58;
  $52 = $149;
  $150 = $52;
  $151 = ((($150)) + 8|0);
  $51 = $151;
  $152 = $51;
  $50 = $152;
  $153 = $50;
  HEAP32[$153>>2] = 0;
  $154 = $58;
  $155 = ((($154)) + 4|0);
  HEAP32[$155>>2] = 0;
  $156 = $58;
  HEAP32[$156>>2] = 0;
  $157 = $77;
  $158 = HEAP32[$157>>2]|0;
  $159 = ((($158)) + -12|0);
  HEAP32[$157>>2] = $159;
 }
 $160 = $83;
 $161 = ((($160)) + 4|0);
 $5 = $84;
 $6 = $161;
 $162 = $5;
 $4 = $162;
 $163 = $4;
 $164 = HEAP32[$163>>2]|0;
 HEAP32[$7>>2] = $164;
 $165 = $6;
 $2 = $165;
 $166 = $2;
 $167 = HEAP32[$166>>2]|0;
 $168 = $5;
 HEAP32[$168>>2] = $167;
 $3 = $7;
 $169 = $3;
 $170 = HEAP32[$169>>2]|0;
 $171 = $6;
 HEAP32[$171>>2] = $170;
 $172 = ((($84)) + 4|0);
 $173 = $83;
 $174 = ((($173)) + 8|0);
 $11 = $172;
 $12 = $174;
 $175 = $11;
 $10 = $175;
 $176 = $10;
 $177 = HEAP32[$176>>2]|0;
 HEAP32[$13>>2] = $177;
 $178 = $12;
 $8 = $178;
 $179 = $8;
 $180 = HEAP32[$179>>2]|0;
 $181 = $11;
 HEAP32[$181>>2] = $180;
 $9 = $13;
 $182 = $9;
 $183 = HEAP32[$182>>2]|0;
 $184 = $12;
 HEAP32[$184>>2] = $183;
 $16 = $84;
 $185 = $16;
 $186 = ((($185)) + 8|0);
 $15 = $186;
 $187 = $15;
 $14 = $187;
 $188 = $14;
 $189 = $83;
 $19 = $189;
 $190 = $19;
 $191 = ((($190)) + 12|0);
 $18 = $191;
 $192 = $18;
 $17 = $192;
 $193 = $17;
 $23 = $188;
 $24 = $193;
 $194 = $23;
 $22 = $194;
 $195 = $22;
 $196 = HEAP32[$195>>2]|0;
 HEAP32[$25>>2] = $196;
 $197 = $24;
 $20 = $197;
 $198 = $20;
 $199 = HEAP32[$198>>2]|0;
 $200 = $23;
 HEAP32[$200>>2] = $199;
 $21 = $25;
 $201 = $21;
 $202 = HEAP32[$201>>2]|0;
 $203 = $24;
 HEAP32[$203>>2] = $202;
 $204 = $83;
 $205 = ((($204)) + 4|0);
 $206 = HEAP32[$205>>2]|0;
 $207 = $83;
 HEAP32[$207>>2] = $206;
 $26 = $84;
 $208 = $26;
 $209 = ((($208)) + 4|0);
 $210 = HEAP32[$209>>2]|0;
 $211 = HEAP32[$208>>2]|0;
 $212 = $210;
 $213 = $211;
 $214 = (($212) - ($213))|0;
 $215 = (($214|0) / 12)&-1;
 __ZNKSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE14__annotate_newEj($84,$215);
 $78 = $84;
 STACKTOP = sp;return;
}
function __ZNSt3__214__split_bufferINS_6vectorIfNS_9allocatorIfEEEERNS2_IS4_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0;
 var $82 = 0, $83 = 0, $84 = 0, $85 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 144|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(144|0);
 $19 = sp + 8|0;
 $22 = sp + 133|0;
 $29 = sp;
 $32 = sp + 132|0;
 $34 = $0;
 $35 = $34;
 $33 = $35;
 $36 = $33;
 $37 = ((($36)) + 4|0);
 $38 = HEAP32[$37>>2]|0;
 $30 = $36;
 $31 = $38;
 $39 = $30;
 $40 = $31;
 ;HEAP8[$29>>0]=HEAP8[$32>>0]|0;
 $27 = $39;
 $28 = $40;
 $41 = $27;
 while(1) {
  $42 = $28;
  $43 = ((($41)) + 8|0);
  $44 = HEAP32[$43>>2]|0;
  $45 = ($42|0)!=($44|0);
  if (!($45)) {
   break;
  }
  $26 = $41;
  $46 = $26;
  $47 = ((($46)) + 12|0);
  $25 = $47;
  $48 = $25;
  $24 = $48;
  $49 = $24;
  $50 = ((($49)) + 4|0);
  $51 = HEAP32[$50>>2]|0;
  $52 = ((($41)) + 8|0);
  $53 = HEAP32[$52>>2]|0;
  $54 = ((($53)) + -12|0);
  HEAP32[$52>>2] = $54;
  $23 = $54;
  $55 = $23;
  $20 = $51;
  $21 = $55;
  $56 = $20;
  $57 = $21;
  ;HEAP8[$19>>0]=HEAP8[$22>>0]|0;
  $17 = $56;
  $18 = $57;
  $58 = $17;
  $59 = $18;
  $15 = $58;
  $16 = $59;
  $60 = $16;
  __ZNSt3__26vectorIfNS_9allocatorIfEEED2Ev($60);
 }
 $61 = HEAP32[$35>>2]|0;
 $62 = ($61|0)!=(0|0);
 if (!($62)) {
  STACKTOP = sp;return;
 }
 $14 = $35;
 $63 = $14;
 $64 = ((($63)) + 12|0);
 $13 = $64;
 $65 = $13;
 $12 = $65;
 $66 = $12;
 $67 = ((($66)) + 4|0);
 $68 = HEAP32[$67>>2]|0;
 $69 = HEAP32[$35>>2]|0;
 $11 = $35;
 $70 = $11;
 $10 = $70;
 $71 = $10;
 $72 = ((($71)) + 12|0);
 $9 = $72;
 $73 = $9;
 $8 = $73;
 $74 = $8;
 $75 = HEAP32[$74>>2]|0;
 $76 = HEAP32[$70>>2]|0;
 $77 = $75;
 $78 = $76;
 $79 = (($77) - ($78))|0;
 $80 = (($79|0) / 12)&-1;
 $5 = $68;
 $6 = $69;
 $7 = $80;
 $81 = $5;
 $82 = $6;
 $83 = $7;
 $2 = $81;
 $3 = $82;
 $4 = $83;
 $84 = $3;
 $1 = $84;
 $85 = $1;
 __ZdlPv($85);
 STACKTOP = sp;return;
}
function __ZNKSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE17__annotate_deleteEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $20 = $0;
 $21 = $20;
 $19 = $21;
 $22 = $19;
 $23 = HEAP32[$22>>2]|0;
 $18 = $23;
 $24 = $18;
 $17 = $21;
 $25 = $17;
 $26 = HEAP32[$25>>2]|0;
 $16 = $26;
 $27 = $16;
 $5 = $21;
 $28 = $5;
 $4 = $28;
 $29 = $4;
 $3 = $29;
 $30 = $3;
 $31 = ((($30)) + 8|0);
 $2 = $31;
 $32 = $2;
 $1 = $32;
 $33 = $1;
 $34 = HEAP32[$33>>2]|0;
 $35 = HEAP32[$29>>2]|0;
 $36 = $34;
 $37 = $35;
 $38 = (($36) - ($37))|0;
 $39 = (($38|0) / 12)&-1;
 $40 = (($27) + (($39*12)|0)|0);
 $7 = $21;
 $41 = $7;
 $42 = HEAP32[$41>>2]|0;
 $6 = $42;
 $43 = $6;
 $8 = $21;
 $44 = $8;
 $45 = ((($44)) + 4|0);
 $46 = HEAP32[$45>>2]|0;
 $47 = HEAP32[$44>>2]|0;
 $48 = $46;
 $49 = $47;
 $50 = (($48) - ($49))|0;
 $51 = (($50|0) / 12)&-1;
 $52 = (($43) + (($51*12)|0)|0);
 $10 = $21;
 $53 = $10;
 $54 = HEAP32[$53>>2]|0;
 $9 = $54;
 $55 = $9;
 $15 = $21;
 $56 = $15;
 $14 = $56;
 $57 = $14;
 $13 = $57;
 $58 = $13;
 $59 = ((($58)) + 8|0);
 $12 = $59;
 $60 = $12;
 $11 = $60;
 $61 = $11;
 $62 = HEAP32[$61>>2]|0;
 $63 = HEAP32[$57>>2]|0;
 $64 = $62;
 $65 = $63;
 $66 = (($64) - ($65))|0;
 $67 = (($66|0) / 12)&-1;
 $68 = (($55) + (($67*12)|0)|0);
 __ZNKSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE31__annotate_contiguous_containerEPKvS7_S7_S7_($21,$24,$40,$52,$68);
 STACKTOP = sp;return;
}
function __ZNK10emscripten3val12internalCallIPFPNS_8internal7_EM_VALES4_jPKPKvS6_EJEEES0_T_DpOT0_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $2 = sp + 16|0;
 $5 = sp + 20|0;
 $6 = sp;
 $3 = $0;
 $4 = $1;
 $7 = $3;
 __ZN10emscripten8internal12WireTypePackIJEEC2Ev($6);
 $8 = $4;
 $9 = HEAP32[$7>>2]|0;
 $10 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJEE8getCountEv($5)|0);
 $11 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJEE8getTypesEv($5)|0);
 $12 = (__ZNK10emscripten8internal12WireTypePackIJEEcvPKvEv($6)|0);
 $13 = (FUNCTION_TABLE_iiiii[$8 & 127]($9,$10,$11,$12)|0);
 __ZN10emscripten3valC2EPNS_8internal7_EM_VALE($2,$13);
 $14 = HEAP32[$2>>2]|0;
 STACKTOP = sp;return ($14|0);
}
function __ZN10emscripten8internal12WireTypePackIJEEC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = sp;
 $2 = $0;
 $4 = $2;
 $1 = $4;
 $5 = $1;
 HEAP32[$3>>2] = $5;
 __ZN10emscripten8internal21writeGenericWireTypesERPNS0_15GenericWireTypeE($3);
 STACKTOP = sp;return;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 0;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJEEEE3getEv()|0);
 STACKTOP = sp;return ($2|0);
}
function __ZNK10emscripten8internal12WireTypePackIJEEcvPKvEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $2;
 $1 = $3;
 $4 = $1;
 STACKTOP = sp;return ($4|0);
}
function __ZN10emscripten8internal21writeGenericWireTypesERPNS0_15GenericWireTypeE($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (6780|0);
}
function __ZNK10emscripten3val12internalCallIPFPNS_8internal7_EM_VALES4_jPKPKvS6_EJiEEES0_T_DpOT0_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = sp + 20|0;
 $8 = sp + 28|0;
 $9 = sp;
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $10 = $5;
 $11 = $7;
 $3 = $11;
 $12 = $3;
 __ZN10emscripten8internal12WireTypePackIJiEEC2EOi($9,$12);
 $13 = $6;
 $14 = HEAP32[$10>>2]|0;
 $15 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJiEE8getCountEv($8)|0);
 $16 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJiEE8getTypesEv($8)|0);
 $17 = (__ZNK10emscripten8internal12WireTypePackIJiEEcvPKvEv($9)|0);
 $18 = (FUNCTION_TABLE_iiiii[$13 & 127]($14,$15,$16,$17)|0);
 __ZN10emscripten3valC2EPNS_8internal7_EM_VALE($4,$18);
 $19 = HEAP32[$4>>2]|0;
 STACKTOP = sp;return ($19|0);
}
function __ZN10emscripten8internal12WireTypePackIJiEEC2EOi($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $9 = sp;
 $7 = $0;
 $8 = $1;
 $10 = $7;
 $6 = $10;
 $11 = $6;
 HEAP32[$9>>2] = $11;
 $12 = $8;
 $2 = $12;
 $13 = $2;
 $4 = $9;
 $5 = $13;
 $14 = $4;
 $15 = $5;
 $3 = $15;
 $16 = $3;
 $17 = (__ZN10emscripten8internal11BindingTypeIiE10toWireTypeERKi($16)|0);
 __ZN10emscripten8internal20writeGenericWireTypeIiEEvRPNS0_15GenericWireTypeET_($14,$17);
 $18 = $4;
 __ZN10emscripten8internal21writeGenericWireTypesERPNS0_15GenericWireTypeE($18);
 STACKTOP = sp;return;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJiEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 1;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJiEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJiEEEE3getEv()|0);
 STACKTOP = sp;return ($2|0);
}
function __ZNK10emscripten8internal12WireTypePackIJiEEcvPKvEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $2;
 $1 = $3;
 $4 = $1;
 STACKTOP = sp;return ($4|0);
}
function __ZN10emscripten8internal20writeGenericWireTypeIiEEvRPNS0_15GenericWireTypeET_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 $5 = $2;
 $6 = HEAP32[$5>>2]|0;
 HEAP32[$6>>2] = $4;
 $7 = $2;
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($8)) + 8|0);
 HEAP32[$7>>2] = $9;
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal11BindingTypeIiE10toWireTypeERKi($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 STACKTOP = sp;return ($3|0);
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJiEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (800|0);
}
function __ZN10emscripten3valC2IRKiEEOT_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = sp;
 $3 = $0;
 $4 = $1;
 $6 = $3;
 $7 = $4;
 $2 = $7;
 $8 = $2;
 __ZN10emscripten8internal12WireTypePackIJRKiEEC2ES3_($5,$8);
 $9 = (__ZN10emscripten8internal6TypeIDIRKiE3getEv()|0);
 $10 = (__ZNK10emscripten8internal12WireTypePackIJRKiEEcvPKvEv($5)|0);
 $11 = (__emval_take_value(($9|0),($10|0))|0);
 HEAP32[$6>>2] = $11;
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal12WireTypePackIJRKiEEC2ES3_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $9 = sp;
 $7 = $0;
 $8 = $1;
 $10 = $7;
 $6 = $10;
 $11 = $6;
 HEAP32[$9>>2] = $11;
 $12 = $8;
 $2 = $12;
 $13 = $2;
 $4 = $9;
 $5 = $13;
 $14 = $4;
 $15 = $5;
 $3 = $15;
 $16 = $3;
 $17 = (__ZN10emscripten8internal11BindingTypeIiE10toWireTypeERKi($16)|0);
 __ZN10emscripten8internal20writeGenericWireTypeIiEEvRPNS0_15GenericWireTypeET_($14,$17);
 $18 = $4;
 __ZN10emscripten8internal21writeGenericWireTypesERPNS0_15GenericWireTypeE($18);
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal6TypeIDIRKiE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIRKiE3getEv()|0);
 return ($0|0);
}
function __ZNK10emscripten8internal12WireTypePackIJRKiEEcvPKvEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $2;
 $1 = $3;
 $4 = $1;
 STACKTOP = sp;return ($4|0);
}
function __ZN10emscripten8internal11LightTypeIDIRKiE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (536|0);
}
function __ZN10emscripten3valC2IRKfEEOT_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = sp;
 $3 = $0;
 $4 = $1;
 $6 = $3;
 $7 = $4;
 $2 = $7;
 $8 = $2;
 __ZN10emscripten8internal12WireTypePackIJRKfEEC2ES3_($5,$8);
 $9 = (__ZN10emscripten8internal6TypeIDIRKfE3getEv()|0);
 $10 = (__ZNK10emscripten8internal12WireTypePackIJRKfEEcvPKvEv($5)|0);
 $11 = (__emval_take_value(($9|0),($10|0))|0);
 HEAP32[$6>>2] = $11;
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal12WireTypePackIJRKfEEC2ES3_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0.0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $9 = sp;
 $7 = $0;
 $8 = $1;
 $10 = $7;
 $6 = $10;
 $11 = $6;
 HEAP32[$9>>2] = $11;
 $12 = $8;
 $2 = $12;
 $13 = $2;
 $4 = $9;
 $5 = $13;
 $14 = $4;
 $15 = $5;
 $3 = $15;
 $16 = $3;
 $17 = (+__ZN10emscripten8internal11BindingTypeIfE10toWireTypeERKf($16));
 __ZN10emscripten8internal20writeGenericWireTypeERPNS0_15GenericWireTypeEf($14,$17);
 $18 = $4;
 __ZN10emscripten8internal21writeGenericWireTypesERPNS0_15GenericWireTypeE($18);
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal6TypeIDIRKfE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIRKfE3getEv()|0);
 return ($0|0);
}
function __ZNK10emscripten8internal12WireTypePackIJRKfEEcvPKvEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $2;
 $1 = $3;
 $4 = $1;
 STACKTOP = sp;return ($4|0);
}
function __ZN10emscripten8internal20writeGenericWireTypeERPNS0_15GenericWireTypeEf($0,$1) {
 $0 = $0|0;
 $1 = +$1;
 var $2 = 0, $3 = 0.0, $4 = 0.0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 $5 = $2;
 $6 = HEAP32[$5>>2]|0;
 HEAPF32[$6>>2] = $4;
 $7 = $2;
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($8)) + 8|0);
 HEAP32[$7>>2] = $9;
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal11BindingTypeIfE10toWireTypeERKf($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = +HEAPF32[$2>>2];
 STACKTOP = sp;return (+$3);
}
function __ZN10emscripten8internal11LightTypeIDIRKfE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (568|0);
}
function __ZN10emscripten8internal11noncopyableC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal15raw_constructorI4Vec3JEEEPT_DpNS0_11BindingTypeIT0_E8WireTypeE() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__Znwj(12)|0);
 ;HEAP32[$0>>2]=0|0;HEAP32[$0+4>>2]=0|0;HEAP32[$0+8>>2]=0|0;
 return ($0|0);
}
function __ZN10emscripten8internal14raw_destructorI4Vec3EEvPT_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ($2|0)==(0|0);
 if (!($3)) {
  __ZdlPv($2);
 }
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal6TypeIDI4Vec3E3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDI4Vec3E3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal11noncopyableD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal11LightTypeIDI4Vec3E3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (8|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (1744|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJviEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (1746|0);
}
function __ZN10emscripten8internal12MemberAccessI4Vec3iE7getWireIS2_EEiRKMS2_iRKT_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 $5 = $2;
 $6 = HEAP32[$5>>2]|0;
 $7 = (($4) + ($6)|0);
 $8 = (__ZN10emscripten8internal11BindingTypeIiE10toWireTypeERKi($7)|0);
 STACKTOP = sp;return ($8|0);
}
function __ZN10emscripten8internal12MemberAccessI4Vec3iE7setWireIS2_EEvRKMS2_iRT_i($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $5;
 $7 = (__ZN10emscripten8internal11BindingTypeIiE12fromWireTypeEi($6)|0);
 $8 = $4;
 $9 = $3;
 $10 = HEAP32[$9>>2]|0;
 $11 = (($8) + ($10)|0);
 HEAP32[$11>>2] = $7;
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal6TypeIDIiE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIiE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal10getContextIM4Vec3iEEPT_RKS4_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(4)|0);
 $3 = $1;
 $4 = HEAP32[$3>>2]|0;
 HEAP32[$2>>2] = $4;
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal11BindingTypeIiE12fromWireTypeEi($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal11LightTypeIDIiE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (536|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJiiiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (1749|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJviiiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (1753|0);
}
function __ZN10emscripten8internal15raw_constructorI5BlockJEEEPT_DpNS0_11BindingTypeIT0_E8WireTypeE() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__Znwj(24)|0);
 ;HEAP32[$0>>2]=0|0;HEAP32[$0+4>>2]=0|0;HEAP32[$0+8>>2]=0|0;HEAP32[$0+12>>2]=0|0;HEAP32[$0+16>>2]=0|0;HEAP32[$0+20>>2]=0|0;
 __ZN5BlockC2Ev($0);
 return ($0|0);
}
function __ZN10emscripten8internal14raw_destructorI5BlockEEvPT_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ($2|0)==(0|0);
 if (!($3)) {
  __ZN5BlockD2Ev($2);
  __ZdlPv($2);
 }
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal6TypeIDI5BlockE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDI5BlockE3getEv()|0);
 return ($0|0);
}
function __ZN5BlockC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $3 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $10 = $0;
 $11 = $10;
 $12 = ((($11)) + 12|0);
 $9 = $12;
 $13 = $9;
 $8 = $13;
 $14 = $8;
 $7 = $14;
 $15 = $7;
 $6 = $15;
 ;HEAP32[$15>>2]=0|0;HEAP32[$15+4>>2]=0|0;HEAP32[$15+8>>2]=0|0;
 $3 = $13;
 $16 = $3;
 $2 = $16;
 $17 = $2;
 $1 = $17;
 $18 = $1;
 $4 = $18;
 $5 = 0;
 while(1) {
  $19 = $5;
  $20 = ($19>>>0)<(3);
  if (!($20)) {
   break;
  }
  $21 = $4;
  $22 = $5;
  $23 = (($21) + ($22<<2)|0);
  HEAP32[$23>>2] = 0;
  $24 = $5;
  $25 = (($24) + 1)|0;
  $5 = $25;
 }
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal11LightTypeIDI5BlockE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (16|0);
}
function __ZN10emscripten8internal12MemberAccessI5Block4Vec3E7getWireIS2_EEPS3_RKMS2_S3_RKT_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 $5 = $2;
 $6 = HEAP32[$5>>2]|0;
 $7 = (($4) + ($6)|0);
 $8 = (__ZN10emscripten8internal18GenericBindingTypeI4Vec3E10toWireTypeERKS2_($7)|0);
 STACKTOP = sp;return ($8|0);
}
function __ZN10emscripten8internal12MemberAccessI5Block4Vec3E7setWireIS2_EEvRKMS2_S3_RT_PS3_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $5;
 $7 = (__ZN10emscripten8internal18GenericBindingTypeI4Vec3E12fromWireTypeEPS2_($6)|0);
 $8 = $4;
 $9 = $3;
 $10 = HEAP32[$9>>2]|0;
 $11 = (($8) + ($10)|0);
 ;HEAP32[$11>>2]=HEAP32[$7>>2]|0;HEAP32[$11+4>>2]=HEAP32[$7+4>>2]|0;HEAP32[$11+8>>2]=HEAP32[$7+8>>2]|0;
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal10getContextIM5Block4Vec3EEPT_RKS5_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(4)|0);
 $3 = $1;
 $4 = HEAP32[$3>>2]|0;
 HEAP32[$2>>2] = $4;
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal18GenericBindingTypeI4Vec3E10toWireTypeERKS2_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(12)|0);
 $3 = $1;
 ;HEAP32[$2>>2]=HEAP32[$3>>2]|0;HEAP32[$2+4>>2]=HEAP32[$3+4>>2]|0;HEAP32[$2+8>>2]=HEAP32[$3+8>>2]|0;
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal18GenericBindingTypeI4Vec3E12fromWireTypeEPS2_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal12MemberAccessI5BlockNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEE7getWireIS2_EEPNS0_11BindingTypeIS9_EUt_ERKMS2_S9_RKT_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 $5 = $2;
 $6 = HEAP32[$5>>2]|0;
 $7 = (($4) + ($6)|0);
 $8 = (__ZN10emscripten8internal11BindingTypeINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE10toWireTypeERKS8_($7)|0);
 STACKTOP = sp;return ($8|0);
}
function __ZN10emscripten8internal12MemberAccessI5BlockNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEE7setWireIS2_EEvRKMS2_S9_RT_PNS0_11BindingTypeIS9_EUt_E($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0;
 var $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0;
 var $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0;
 var $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 224|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(224|0);
 $17 = sp + 8|0;
 $20 = sp + 223|0;
 $47 = sp + 222|0;
 $48 = sp + 221|0;
 $51 = sp;
 $54 = sp + 220|0;
 $58 = sp + 12|0;
 $55 = $0;
 $56 = $1;
 $57 = $2;
 $59 = $57;
 __ZN10emscripten8internal11BindingTypeINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE12fromWireTypeEPNS9_Ut_E($58,$59);
 $60 = $56;
 $61 = $55;
 $62 = HEAP32[$61>>2]|0;
 $63 = (($60) + ($62)|0);
 $52 = $63;
 $53 = $58;
 $64 = $52;
 $65 = $53;
 ;HEAP8[$51>>0]=HEAP8[$54>>0]|0;
 $49 = $64;
 $50 = $65;
 $66 = $49;
 $46 = $66;
 $67 = $46;
 $45 = $67;
 $44 = $67;
 $68 = $44;
 $43 = $68;
 $69 = $43;
 $42 = $69;
 $70 = $42;
 $71 = ((($70)) + 11|0);
 $72 = HEAP8[$71>>0]|0;
 $73 = $72&255;
 $74 = $73 & 128;
 $75 = ($74|0)!=(0);
 if ($75) {
  $37 = $67;
  $76 = $37;
  $36 = $76;
  $77 = $36;
  $35 = $77;
  $78 = $35;
  $79 = HEAP32[$78>>2]|0;
  HEAP8[$47>>0] = 0;
  __ZNSt3__211char_traitsIcE6assignERcRKc($79,$47);
  $28 = $67;
  $29 = 0;
  $80 = $28;
  $81 = $29;
  $27 = $80;
  $82 = $27;
  $26 = $82;
  $83 = $26;
  $84 = ((($83)) + 4|0);
  HEAP32[$84>>2] = $81;
 } else {
  $34 = $67;
  $85 = $34;
  $33 = $85;
  $86 = $33;
  $32 = $86;
  $87 = $32;
  $31 = $87;
  $88 = $31;
  $30 = $88;
  $89 = $30;
  HEAP8[$48>>0] = 0;
  __ZNSt3__211char_traitsIcE6assignERcRKc($89,$48);
  $40 = $67;
  $41 = 0;
  $90 = $40;
  $91 = $41;
  $92 = $91&255;
  $39 = $90;
  $93 = $39;
  $38 = $93;
  $94 = $38;
  $95 = ((($94)) + 11|0);
  HEAP8[$95>>0] = $92;
 }
 $25 = $66;
 $96 = $25;
 __THREW__ = 0;
 invoke_vii(107,($96|0),0);
 $97 = __THREW__; __THREW__ = 0;
 $98 = $97&1;
 if ($98) {
  $99 = ___cxa_find_matching_catch_3(0|0)|0;
  $100 = tempRet0;
  ___clang_call_terminate($99);
  // unreachable;
 }
 $101 = $50;
 $24 = $101;
 $102 = $24;
 $23 = $102;
 $103 = $23;
 $22 = $66;
 $104 = $22;
 $21 = $104;
 $105 = $21;
 ;HEAP32[$105>>2]=HEAP32[$103>>2]|0;HEAP32[$105+4>>2]=HEAP32[$103+4>>2]|0;HEAP32[$105+8>>2]=HEAP32[$103+8>>2]|0;
 $106 = $50;
 $18 = $66;
 $19 = $106;
 $107 = $18;
 $108 = $19;
 ;HEAP8[$17>>0]=HEAP8[$20>>0]|0;
 $15 = $107;
 $16 = $108;
 $109 = $15;
 $110 = $16;
 $14 = $110;
 $111 = $14;
 $13 = $111;
 $112 = $13;
 $12 = $112;
 $113 = $12;
 $8 = $113;
 $11 = $109;
 $114 = $11;
 $10 = $114;
 $115 = $10;
 $9 = $115;
 $116 = $50;
 $5 = $116;
 $117 = $5;
 $4 = $117;
 $118 = $4;
 $3 = $118;
 $119 = $3;
 $6 = $119;
 $7 = 0;
 while(1) {
  $120 = $7;
  $121 = ($120>>>0)<(3);
  if (!($121)) {
   break;
  }
  $122 = $6;
  $123 = $7;
  $124 = (($122) + ($123<<2)|0);
  HEAP32[$124>>2] = 0;
  $125 = $7;
  $126 = (($125) + 1)|0;
  $7 = $126;
 }
 __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($58);
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal6TypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal10getContextIM5BlockNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEEEPT_RKSB_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(4)|0);
 $3 = $1;
 $4 = HEAP32[$3>>2]|0;
 HEAP32[$2>>2] = $4;
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal11BindingTypeINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE10toWireTypeERKS8_($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0;
 var $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0;
 var $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0;
 var $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0;
 var $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0;
 var $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0;
 var $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 208|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(208|0);
 $48 = $0;
 $50 = $48;
 $47 = $50;
 $51 = $47;
 $46 = $51;
 $52 = $46;
 $45 = $52;
 $53 = $45;
 $44 = $53;
 $54 = $44;
 $43 = $54;
 $55 = $43;
 $56 = ((($55)) + 11|0);
 $57 = HEAP8[$56>>0]|0;
 $58 = $57&255;
 $59 = $58 & 128;
 $60 = ($59|0)!=(0);
 if ($60) {
  $39 = $52;
  $61 = $39;
  $38 = $61;
  $62 = $38;
  $37 = $62;
  $63 = $37;
  $64 = ((($63)) + 4|0);
  $65 = HEAP32[$64>>2]|0;
  $73 = $65;
 } else {
  $42 = $52;
  $66 = $42;
  $41 = $66;
  $67 = $41;
  $40 = $67;
  $68 = $40;
  $69 = ((($68)) + 11|0);
  $70 = HEAP8[$69>>0]|0;
  $71 = $70&255;
  $73 = $71;
 }
 $72 = (4 + ($73))|0;
 $74 = (_malloc($72)|0);
 $49 = $74;
 $75 = $48;
 $11 = $75;
 $76 = $11;
 $10 = $76;
 $77 = $10;
 $9 = $77;
 $78 = $9;
 $8 = $78;
 $79 = $8;
 $7 = $79;
 $80 = $7;
 $81 = ((($80)) + 11|0);
 $82 = HEAP8[$81>>0]|0;
 $83 = $82&255;
 $84 = $83 & 128;
 $85 = ($84|0)!=(0);
 if ($85) {
  $3 = $77;
  $86 = $3;
  $2 = $86;
  $87 = $2;
  $1 = $87;
  $88 = $1;
  $89 = ((($88)) + 4|0);
  $90 = HEAP32[$89>>2]|0;
  $98 = $90;
 } else {
  $6 = $77;
  $91 = $6;
  $5 = $91;
  $92 = $5;
  $4 = $92;
  $93 = $4;
  $94 = ((($93)) + 11|0);
  $95 = HEAP8[$94>>0]|0;
  $96 = $95&255;
  $98 = $96;
 }
 $97 = $49;
 HEAP32[$97>>2] = $98;
 $99 = $49;
 $100 = ((($99)) + 4|0);
 $101 = $48;
 $25 = $101;
 $102 = $25;
 $24 = $102;
 $103 = $24;
 $23 = $103;
 $104 = $23;
 $22 = $104;
 $105 = $22;
 $21 = $105;
 $106 = $21;
 $107 = ((($106)) + 11|0);
 $108 = HEAP8[$107>>0]|0;
 $109 = $108&255;
 $110 = $109 & 128;
 $111 = ($110|0)!=(0);
 if ($111) {
  $15 = $103;
  $112 = $15;
  $14 = $112;
  $113 = $14;
  $13 = $113;
  $114 = $13;
  $115 = HEAP32[$114>>2]|0;
  $121 = $115;
 } else {
  $20 = $103;
  $116 = $20;
  $19 = $116;
  $117 = $19;
  $18 = $117;
  $118 = $18;
  $17 = $118;
  $119 = $17;
  $16 = $119;
  $120 = $16;
  $121 = $120;
 }
 $12 = $121;
 $122 = $12;
 $123 = $48;
 $36 = $123;
 $124 = $36;
 $35 = $124;
 $125 = $35;
 $34 = $125;
 $126 = $34;
 $33 = $126;
 $127 = $33;
 $32 = $127;
 $128 = $32;
 $129 = ((($128)) + 11|0);
 $130 = HEAP8[$129>>0]|0;
 $131 = $130&255;
 $132 = $131 & 128;
 $133 = ($132|0)!=(0);
 if ($133) {
  $28 = $125;
  $134 = $28;
  $27 = $134;
  $135 = $27;
  $26 = $135;
  $136 = $26;
  $137 = ((($136)) + 4|0);
  $138 = HEAP32[$137>>2]|0;
  $145 = $138;
  _memcpy(($100|0),($122|0),($145|0))|0;
  $146 = $49;
  STACKTOP = sp;return ($146|0);
 } else {
  $31 = $125;
  $139 = $31;
  $30 = $139;
  $140 = $30;
  $29 = $140;
  $141 = $29;
  $142 = ((($141)) + 11|0);
  $143 = HEAP8[$142>>0]|0;
  $144 = $143&255;
  $145 = $144;
  _memcpy(($100|0),($122|0),($145|0))|0;
  $146 = $49;
  STACKTOP = sp;return ($146|0);
 }
 return (0)|0;
}
function __ZN10emscripten8internal11BindingTypeINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE12fromWireTypeEPNS9_Ut_E($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $8 = $1;
 $9 = $8;
 $10 = ((($9)) + 4|0);
 $11 = $8;
 $12 = HEAP32[$11>>2]|0;
 $5 = $0;
 $6 = $10;
 $7 = $12;
 $13 = $5;
 $4 = $13;
 $14 = $4;
 $3 = $14;
 $15 = $3;
 $2 = $15;
 ;HEAP32[$15>>2]=0|0;HEAP32[$15+4>>2]=0|0;HEAP32[$15+8>>2]=0|0;
 $16 = $6;
 $17 = $7;
 __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6__initEPKcj($13,$16,$17);
 STACKTOP = sp;return;
}
function __ZNSt3__211char_traitsIcE6assignERcRKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 $5 = HEAP8[$4>>0]|0;
 $6 = $2;
 HEAP8[$6>>0] = $5;
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (32|0);
}
function __ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEE9push_backERKS1_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 96|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(96|0);
 $10 = sp;
 $15 = sp + 89|0;
 $25 = sp + 88|0;
 $23 = $0;
 $24 = $1;
 $26 = $23;
 $27 = ((($26)) + 4|0);
 $28 = HEAP32[$27>>2]|0;
 $22 = $26;
 $29 = $22;
 $30 = ((($29)) + 8|0);
 $21 = $30;
 $31 = $21;
 $20 = $31;
 $32 = $20;
 $33 = HEAP32[$32>>2]|0;
 $34 = ($28|0)!=($33|0);
 if ($34) {
  __ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEE24__RAII_IncreaseAnnotatorC2ERKS4_j($25,$26,1);
  $19 = $26;
  $35 = $19;
  $36 = ((($35)) + 8|0);
  $18 = $36;
  $37 = $18;
  $17 = $37;
  $38 = $17;
  $39 = ((($26)) + 4|0);
  $40 = HEAP32[$39>>2]|0;
  $16 = $40;
  $41 = $16;
  $42 = $24;
  $12 = $38;
  $13 = $41;
  $14 = $42;
  $43 = $12;
  $44 = $13;
  $45 = $14;
  $11 = $45;
  $46 = $11;
  ;HEAP8[$10>>0]=HEAP8[$15>>0]|0;
  $7 = $43;
  $8 = $44;
  $9 = $46;
  $47 = $7;
  $48 = $8;
  $49 = $9;
  $6 = $49;
  $50 = $6;
  $3 = $47;
  $4 = $48;
  $5 = $50;
  $51 = $4;
  $52 = $5;
  $2 = $52;
  $53 = $2;
  __ZN5BlockC2ERKS_($51,$53);
  __ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEE24__RAII_IncreaseAnnotator6__doneEv($25);
  $54 = ((($26)) + 4|0);
  $55 = HEAP32[$54>>2]|0;
  $56 = ((($55)) + 24|0);
  HEAP32[$54>>2] = $56;
  STACKTOP = sp;return;
 } else {
  $57 = $24;
  __ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEE21__push_back_slow_pathIRKS1_EEvOT_($26,$57);
  STACKTOP = sp;return;
 }
}
function __ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEE6resizeEjRKS1_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0;
 var $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 96|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(96|0);
 $7 = sp;
 $10 = sp + 88|0;
 $22 = $0;
 $23 = $1;
 $24 = $2;
 $26 = $22;
 $21 = $26;
 $27 = $21;
 $28 = ((($27)) + 4|0);
 $29 = HEAP32[$28>>2]|0;
 $30 = HEAP32[$27>>2]|0;
 $31 = $29;
 $32 = $30;
 $33 = (($31) - ($32))|0;
 $34 = (($33|0) / 24)&-1;
 $25 = $34;
 $35 = $25;
 $36 = $23;
 $37 = ($35>>>0)<($36>>>0);
 if ($37) {
  $38 = $23;
  $39 = $25;
  $40 = (($38) - ($39))|0;
  $41 = $24;
  __ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEE8__appendEjRKS1_($26,$40,$41);
  STACKTOP = sp;return;
 }
 $42 = $25;
 $43 = $23;
 $44 = ($42>>>0)>($43>>>0);
 if (!($44)) {
  STACKTOP = sp;return;
 }
 $45 = HEAP32[$26>>2]|0;
 $46 = $23;
 $47 = (($45) + (($46*24)|0)|0);
 $18 = $26;
 $19 = $47;
 $48 = $18;
 $17 = $48;
 $49 = $17;
 $50 = ((($49)) + 4|0);
 $51 = HEAP32[$50>>2]|0;
 $52 = HEAP32[$49>>2]|0;
 $53 = $51;
 $54 = $52;
 $55 = (($53) - ($54))|0;
 $56 = (($55|0) / 24)&-1;
 $20 = $56;
 $57 = $19;
 $15 = $48;
 $16 = $57;
 $58 = $15;
 while(1) {
  $59 = $16;
  $60 = ((($58)) + 4|0);
  $61 = HEAP32[$60>>2]|0;
  $62 = ($59|0)!=($61|0);
  if (!($62)) {
   break;
  }
  $14 = $58;
  $63 = $14;
  $64 = ((($63)) + 8|0);
  $13 = $64;
  $65 = $13;
  $12 = $65;
  $66 = $12;
  $67 = ((($58)) + 4|0);
  $68 = HEAP32[$67>>2]|0;
  $69 = ((($68)) + -24|0);
  HEAP32[$67>>2] = $69;
  $11 = $69;
  $70 = $11;
  $8 = $66;
  $9 = $70;
  $71 = $8;
  $72 = $9;
  ;HEAP8[$7>>0]=HEAP8[$10>>0]|0;
  $5 = $71;
  $6 = $72;
  $73 = $5;
  $74 = $6;
  $3 = $73;
  $4 = $74;
  $75 = $4;
  __ZN5BlockD2Ev($75);
 }
 $76 = $20;
 __THREW__ = 0;
 invoke_vii(108,($48|0),($76|0));
 $77 = __THREW__; __THREW__ = 0;
 $78 = $77&1;
 if ($78) {
  $79 = ___cxa_find_matching_catch_3(0|0)|0;
  $80 = tempRet0;
  ___clang_call_terminate($79);
  // unreachable;
 } else {
  STACKTOP = sp;return;
 }
}
function __ZN10emscripten8internal12VectorAccessINSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE3getERKS7_j($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $3 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = sp + 8|0;
 $6 = $0;
 $7 = $1;
 $8 = $7;
 $9 = $6;
 $4 = $9;
 $10 = $4;
 $11 = ((($10)) + 4|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = HEAP32[$10>>2]|0;
 $14 = $12;
 $15 = $13;
 $16 = (($14) - ($15))|0;
 $17 = (($16|0) / 24)&-1;
 $18 = ($8>>>0)<($17>>>0);
 if ($18) {
  $19 = $6;
  $20 = $7;
  $2 = $19;
  $3 = $20;
  $21 = $2;
  $22 = HEAP32[$21>>2]|0;
  $23 = $3;
  $24 = (($22) + (($23*24)|0)|0);
  __ZN10emscripten3valC2IRK5BlockEEOT_($5,$24);
  $26 = HEAP32[$5>>2]|0;
  STACKTOP = sp;return ($26|0);
 } else {
  $25 = (__ZN10emscripten3val9undefinedEv()|0);
  HEAP32[$5>>2] = $25;
  $26 = HEAP32[$5>>2]|0;
  STACKTOP = sp;return ($26|0);
 }
 return (0)|0;
}
function __ZN10emscripten8internal12VectorAccessINSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE3setERS7_jRKS4_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $8 = $7;
 $9 = $5;
 $10 = $6;
 $3 = $9;
 $4 = $10;
 $11 = $3;
 $12 = HEAP32[$11>>2]|0;
 $13 = $4;
 $14 = (($12) + (($13*24)|0)|0);
 (__ZN5BlockaSERKS_($14,$8)|0);
 STACKTOP = sp;return 1;
}
function __ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEE24__RAII_IncreaseAnnotatorC2ERKS4_j($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEE24__RAII_IncreaseAnnotator6__doneEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEE21__push_back_slow_pathIRKS1_EEvOT_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0;
 var $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 208|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(208|0);
 $10 = sp + 8|0;
 $15 = sp + 201|0;
 $24 = sp;
 $27 = sp + 200|0;
 $35 = sp + 80|0;
 $38 = sp + 68|0;
 $46 = sp + 20|0;
 $43 = $0;
 $44 = $1;
 $49 = $43;
 $42 = $49;
 $50 = $42;
 $51 = ((($50)) + 8|0);
 $41 = $51;
 $52 = $41;
 $40 = $52;
 $53 = $40;
 $45 = $53;
 $39 = $49;
 $54 = $39;
 $55 = ((($54)) + 4|0);
 $56 = HEAP32[$55>>2]|0;
 $57 = HEAP32[$54>>2]|0;
 $58 = $56;
 $59 = $57;
 $60 = (($58) - ($59))|0;
 $61 = (($60|0) / 24)&-1;
 $62 = (($61) + 1)|0;
 $34 = $49;
 HEAP32[$35>>2] = $62;
 $63 = $34;
 $64 = (__ZNKSt3__26vectorI5BlockNS_9allocatorIS1_EEE8max_sizeEv($63)|0);
 $36 = $64;
 $65 = HEAP32[$35>>2]|0;
 $66 = $36;
 $67 = ($65>>>0)>($66>>>0);
 if ($67) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($63);
  // unreachable;
 }
 $32 = $63;
 $68 = $32;
 $31 = $68;
 $69 = $31;
 $30 = $69;
 $70 = $30;
 $71 = ((($70)) + 8|0);
 $29 = $71;
 $72 = $29;
 $28 = $72;
 $73 = $28;
 $74 = HEAP32[$73>>2]|0;
 $75 = HEAP32[$69>>2]|0;
 $76 = $74;
 $77 = $75;
 $78 = (($76) - ($77))|0;
 $79 = (($78|0) / 24)&-1;
 $37 = $79;
 $80 = $37;
 $81 = $36;
 $82 = (($81>>>0) / 2)&-1;
 $83 = ($80>>>0)>=($82>>>0);
 if ($83) {
  $84 = $36;
  $33 = $84;
 } else {
  $85 = $37;
  $86 = $85<<1;
  HEAP32[$38>>2] = $86;
  $25 = $38;
  $26 = $35;
  $87 = $25;
  $88 = $26;
  ;HEAP8[$24>>0]=HEAP8[$27>>0]|0;
  $22 = $87;
  $23 = $88;
  $89 = $22;
  $90 = $23;
  $19 = $24;
  $20 = $89;
  $21 = $90;
  $91 = $20;
  $92 = HEAP32[$91>>2]|0;
  $93 = $21;
  $94 = HEAP32[$93>>2]|0;
  $95 = ($92>>>0)<($94>>>0);
  $96 = $23;
  $97 = $22;
  $98 = $95 ? $96 : $97;
  $99 = HEAP32[$98>>2]|0;
  $33 = $99;
 }
 $100 = $33;
 $18 = $49;
 $101 = $18;
 $102 = ((($101)) + 4|0);
 $103 = HEAP32[$102>>2]|0;
 $104 = HEAP32[$101>>2]|0;
 $105 = $103;
 $106 = $104;
 $107 = (($105) - ($106))|0;
 $108 = (($107|0) / 24)&-1;
 $109 = $45;
 __ZNSt3__214__split_bufferI5BlockRNS_9allocatorIS1_EEEC2EjjS4_($46,$100,$108,$109);
 $110 = $45;
 $111 = ((($46)) + 8|0);
 $112 = HEAP32[$111>>2]|0;
 $17 = $112;
 $113 = $17;
 $114 = $44;
 $16 = $114;
 $115 = $16;
 $12 = $110;
 $13 = $113;
 $14 = $115;
 $116 = $12;
 $117 = $13;
 $118 = $14;
 $11 = $118;
 $119 = $11;
 ;HEAP8[$10>>0]=HEAP8[$15>>0]|0;
 $7 = $116;
 $8 = $117;
 $9 = $119;
 $120 = $7;
 $121 = $8;
 $122 = $9;
 $6 = $122;
 $123 = $6;
 $3 = $120;
 $4 = $121;
 $5 = $123;
 $124 = $4;
 $125 = $5;
 $2 = $125;
 $126 = $2;
 __THREW__ = 0;
 invoke_vii(51,($124|0),($126|0));
 $127 = __THREW__; __THREW__ = 0;
 $128 = $127&1;
 if ($128) {
  $134 = ___cxa_find_matching_catch_2()|0;
  $135 = tempRet0;
  $47 = $134;
  $48 = $135;
  __ZNSt3__214__split_bufferI5BlockRNS_9allocatorIS1_EEED2Ev($46);
  $136 = $47;
  $137 = $48;
  ___resumeException($136|0);
  // unreachable;
 }
 $129 = ((($46)) + 8|0);
 $130 = HEAP32[$129>>2]|0;
 $131 = ((($130)) + 24|0);
 HEAP32[$129>>2] = $131;
 __THREW__ = 0;
 invoke_vii(109,($49|0),($46|0));
 $132 = __THREW__; __THREW__ = 0;
 $133 = $132&1;
 if ($133) {
  $134 = ___cxa_find_matching_catch_2()|0;
  $135 = tempRet0;
  $47 = $134;
  $48 = $135;
  __ZNSt3__214__split_bufferI5BlockRNS_9allocatorIS1_EEED2Ev($46);
  $136 = $47;
  $137 = $48;
  ___resumeException($136|0);
  // unreachable;
 } else {
  __ZNSt3__214__split_bufferI5BlockRNS_9allocatorIS1_EEED2Ev($46);
  STACKTOP = sp;return;
 }
}
function __ZNSt3__214__split_bufferI5BlockRNS_9allocatorIS1_EEEC2EjjS4_($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 112|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(112|0);
 $21 = sp + 36|0;
 $25 = sp + 20|0;
 $27 = $0;
 $28 = $1;
 $29 = $2;
 $30 = $3;
 $31 = $27;
 $32 = ((($31)) + 12|0);
 $33 = $30;
 $24 = $32;
 HEAP32[$25>>2] = 0;
 $26 = $33;
 $34 = $24;
 $23 = $25;
 $35 = $23;
 $36 = HEAP32[$35>>2]|0;
 $37 = $26;
 $17 = $37;
 $38 = $17;
 $20 = $34;
 HEAP32[$21>>2] = $36;
 $22 = $38;
 $39 = $20;
 $19 = $21;
 $40 = $19;
 $41 = HEAP32[$40>>2]|0;
 HEAP32[$39>>2] = $41;
 $42 = ((($39)) + 4|0);
 $43 = $22;
 $18 = $43;
 $44 = $18;
 HEAP32[$42>>2] = $44;
 $45 = $28;
 $46 = ($45|0)!=(0);
 do {
  if ($46) {
   $6 = $31;
   $47 = $6;
   $48 = ((($47)) + 12|0);
   $5 = $48;
   $49 = $5;
   $4 = $49;
   $50 = $4;
   $51 = ((($50)) + 4|0);
   $52 = HEAP32[$51>>2]|0;
   $53 = $28;
   $12 = $52;
   $13 = $53;
   $54 = $12;
   $55 = $13;
   $9 = $54;
   $10 = $55;
   $11 = 0;
   $56 = $9;
   $57 = $10;
   $8 = $56;
   $58 = ($57>>>0)>(178956970);
   if ($58) {
    $59 = (___cxa_allocate_exception(4)|0);
    __ZNSt9bad_allocC2Ev($59);
    ___cxa_throw(($59|0),(360|0),(18|0));
    // unreachable;
   } else {
    $60 = $10;
    $61 = ($60*24)|0;
    $7 = $61;
    $62 = $7;
    $63 = (__Znwj($62)|0);
    $64 = $63;
    break;
   }
  } else {
   $64 = 0;
  }
 } while(0);
 HEAP32[$31>>2] = $64;
 $65 = HEAP32[$31>>2]|0;
 $66 = $29;
 $67 = (($65) + (($66*24)|0)|0);
 $68 = ((($31)) + 8|0);
 HEAP32[$68>>2] = $67;
 $69 = ((($31)) + 4|0);
 HEAP32[$69>>2] = $67;
 $70 = HEAP32[$31>>2]|0;
 $71 = $28;
 $72 = (($70) + (($71*24)|0)|0);
 $16 = $31;
 $73 = $16;
 $74 = ((($73)) + 12|0);
 $15 = $74;
 $75 = $15;
 $14 = $75;
 $76 = $14;
 HEAP32[$76>>2] = $72;
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEE26__swap_out_circular_bufferERNS_14__split_bufferIS1_RS3_EE($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0;
 var $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0;
 var $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0;
 var $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 208|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(208|0);
 $7 = sp + 180|0;
 $19 = sp + 132|0;
 $26 = sp + 104|0;
 $37 = sp;
 $42 = sp + 204|0;
 $52 = $0;
 $53 = $1;
 $54 = $52;
 __ZNKSt3__26vectorI5BlockNS_9allocatorIS1_EEE17__annotate_deleteEv($54);
 $51 = $54;
 $55 = $51;
 $56 = ((($55)) + 8|0);
 $50 = $56;
 $57 = $50;
 $49 = $57;
 $58 = $49;
 $59 = HEAP32[$54>>2]|0;
 $60 = ((($54)) + 4|0);
 $61 = HEAP32[$60>>2]|0;
 $62 = $53;
 $63 = ((($62)) + 4|0);
 $44 = $58;
 $45 = $59;
 $46 = $61;
 $47 = $63;
 while(1) {
  $64 = $46;
  $65 = $45;
  $66 = ($64|0)!=($65|0);
  if (!($66)) {
   break;
  }
  $67 = $44;
  $68 = $47;
  $69 = HEAP32[$68>>2]|0;
  $70 = ((($69)) + -24|0);
  $43 = $70;
  $71 = $43;
  $72 = $46;
  $73 = ((($72)) + -24|0);
  $46 = $73;
  $28 = $73;
  $74 = $28;
  $27 = $74;
  $75 = $27;
  $39 = $67;
  $40 = $71;
  $41 = $75;
  $76 = $39;
  $77 = $40;
  $78 = $41;
  $38 = $78;
  $79 = $38;
  ;HEAP8[$37>>0]=HEAP8[$42>>0]|0;
  $34 = $76;
  $35 = $77;
  $36 = $79;
  $80 = $34;
  $81 = $35;
  $82 = $36;
  $33 = $82;
  $83 = $33;
  $30 = $80;
  $31 = $81;
  $32 = $83;
  $84 = $31;
  $85 = $32;
  $29 = $85;
  $86 = $29;
  __ZN5BlockC2EOS_($84,$86);
  $87 = $47;
  $88 = HEAP32[$87>>2]|0;
  $89 = ((($88)) + -24|0);
  HEAP32[$87>>2] = $89;
 }
 $90 = $53;
 $91 = ((($90)) + 4|0);
 $24 = $54;
 $25 = $91;
 $92 = $24;
 $23 = $92;
 $93 = $23;
 $94 = HEAP32[$93>>2]|0;
 HEAP32[$26>>2] = $94;
 $95 = $25;
 $21 = $95;
 $96 = $21;
 $97 = HEAP32[$96>>2]|0;
 $98 = $24;
 HEAP32[$98>>2] = $97;
 $22 = $26;
 $99 = $22;
 $100 = HEAP32[$99>>2]|0;
 $101 = $25;
 HEAP32[$101>>2] = $100;
 $102 = ((($54)) + 4|0);
 $103 = $53;
 $104 = ((($103)) + 8|0);
 $5 = $102;
 $6 = $104;
 $105 = $5;
 $4 = $105;
 $106 = $4;
 $107 = HEAP32[$106>>2]|0;
 HEAP32[$7>>2] = $107;
 $108 = $6;
 $2 = $108;
 $109 = $2;
 $110 = HEAP32[$109>>2]|0;
 $111 = $5;
 HEAP32[$111>>2] = $110;
 $3 = $7;
 $112 = $3;
 $113 = HEAP32[$112>>2]|0;
 $114 = $6;
 HEAP32[$114>>2] = $113;
 $10 = $54;
 $115 = $10;
 $116 = ((($115)) + 8|0);
 $9 = $116;
 $117 = $9;
 $8 = $117;
 $118 = $8;
 $119 = $53;
 $13 = $119;
 $120 = $13;
 $121 = ((($120)) + 12|0);
 $12 = $121;
 $122 = $12;
 $11 = $122;
 $123 = $11;
 $17 = $118;
 $18 = $123;
 $124 = $17;
 $16 = $124;
 $125 = $16;
 $126 = HEAP32[$125>>2]|0;
 HEAP32[$19>>2] = $126;
 $127 = $18;
 $14 = $127;
 $128 = $14;
 $129 = HEAP32[$128>>2]|0;
 $130 = $17;
 HEAP32[$130>>2] = $129;
 $15 = $19;
 $131 = $15;
 $132 = HEAP32[$131>>2]|0;
 $133 = $18;
 HEAP32[$133>>2] = $132;
 $134 = $53;
 $135 = ((($134)) + 4|0);
 $136 = HEAP32[$135>>2]|0;
 $137 = $53;
 HEAP32[$137>>2] = $136;
 $20 = $54;
 $138 = $20;
 $139 = ((($138)) + 4|0);
 $140 = HEAP32[$139>>2]|0;
 $141 = HEAP32[$138>>2]|0;
 $142 = $140;
 $143 = $141;
 $144 = (($142) - ($143))|0;
 $145 = (($144|0) / 24)&-1;
 __ZNKSt3__26vectorI5BlockNS_9allocatorIS1_EEE14__annotate_newEj($54,$145);
 $48 = $54;
 STACKTOP = sp;return;
}
function __ZNSt3__214__split_bufferI5BlockRNS_9allocatorIS1_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0;
 var $82 = 0, $83 = 0, $84 = 0, $85 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 144|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(144|0);
 $19 = sp + 8|0;
 $22 = sp + 133|0;
 $29 = sp;
 $32 = sp + 132|0;
 $34 = $0;
 $35 = $34;
 $33 = $35;
 $36 = $33;
 $37 = ((($36)) + 4|0);
 $38 = HEAP32[$37>>2]|0;
 $30 = $36;
 $31 = $38;
 $39 = $30;
 $40 = $31;
 ;HEAP8[$29>>0]=HEAP8[$32>>0]|0;
 $27 = $39;
 $28 = $40;
 $41 = $27;
 while(1) {
  $42 = $28;
  $43 = ((($41)) + 8|0);
  $44 = HEAP32[$43>>2]|0;
  $45 = ($42|0)!=($44|0);
  if (!($45)) {
   break;
  }
  $26 = $41;
  $46 = $26;
  $47 = ((($46)) + 12|0);
  $25 = $47;
  $48 = $25;
  $24 = $48;
  $49 = $24;
  $50 = ((($49)) + 4|0);
  $51 = HEAP32[$50>>2]|0;
  $52 = ((($41)) + 8|0);
  $53 = HEAP32[$52>>2]|0;
  $54 = ((($53)) + -24|0);
  HEAP32[$52>>2] = $54;
  $23 = $54;
  $55 = $23;
  $20 = $51;
  $21 = $55;
  $56 = $20;
  $57 = $21;
  ;HEAP8[$19>>0]=HEAP8[$22>>0]|0;
  $17 = $56;
  $18 = $57;
  $58 = $17;
  $59 = $18;
  $15 = $58;
  $16 = $59;
  $60 = $16;
  __ZN5BlockD2Ev($60);
 }
 $61 = HEAP32[$35>>2]|0;
 $62 = ($61|0)!=(0|0);
 if (!($62)) {
  STACKTOP = sp;return;
 }
 $14 = $35;
 $63 = $14;
 $64 = ((($63)) + 12|0);
 $13 = $64;
 $65 = $13;
 $12 = $65;
 $66 = $12;
 $67 = ((($66)) + 4|0);
 $68 = HEAP32[$67>>2]|0;
 $69 = HEAP32[$35>>2]|0;
 $11 = $35;
 $70 = $11;
 $10 = $70;
 $71 = $10;
 $72 = ((($71)) + 12|0);
 $9 = $72;
 $73 = $9;
 $8 = $73;
 $74 = $8;
 $75 = HEAP32[$74>>2]|0;
 $76 = HEAP32[$70>>2]|0;
 $77 = $75;
 $78 = $76;
 $79 = (($77) - ($78))|0;
 $80 = (($79|0) / 24)&-1;
 $5 = $68;
 $6 = $69;
 $7 = $80;
 $81 = $5;
 $82 = $6;
 $83 = $7;
 $2 = $81;
 $3 = $82;
 $4 = $83;
 $84 = $3;
 $1 = $84;
 $85 = $1;
 __ZdlPv($85);
 STACKTOP = sp;return;
}
function __ZNKSt3__26vectorI5BlockNS_9allocatorIS1_EEE8max_sizeEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $6 = sp + 8|0;
 $9 = sp + 77|0;
 $12 = sp;
 $14 = sp + 76|0;
 $19 = sp + 16|0;
 $20 = sp + 12|0;
 $18 = $0;
 $21 = $18;
 $17 = $21;
 $22 = $17;
 $23 = ((($22)) + 8|0);
 $16 = $23;
 $24 = $16;
 $15 = $24;
 $25 = $15;
 $13 = $25;
 $26 = $13;
 ;HEAP8[$12>>0]=HEAP8[$14>>0]|0;
 $11 = $26;
 $27 = $11;
 $10 = $27;
 HEAP32[$19>>2] = 178956970;
 $28 = (4294967295 / 2)&-1;
 HEAP32[$20>>2] = $28;
 $7 = $19;
 $8 = $20;
 $29 = $7;
 $30 = $8;
 ;HEAP8[$6>>0]=HEAP8[$9>>0]|0;
 $4 = $29;
 $5 = $30;
 $31 = $5;
 $32 = $4;
 $1 = $6;
 $2 = $31;
 $3 = $32;
 $33 = $2;
 $34 = HEAP32[$33>>2]|0;
 $35 = $3;
 $36 = HEAP32[$35>>2]|0;
 $37 = ($34>>>0)<($36>>>0);
 $38 = $5;
 $39 = $4;
 $40 = $37 ? $38 : $39;
 $41 = HEAP32[$40>>2]|0;
 STACKTOP = sp;return ($41|0);
}
function __ZNKSt3__26vectorI5BlockNS_9allocatorIS1_EEE17__annotate_deleteEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $20 = $0;
 $21 = $20;
 $19 = $21;
 $22 = $19;
 $23 = HEAP32[$22>>2]|0;
 $18 = $23;
 $24 = $18;
 $17 = $21;
 $25 = $17;
 $26 = HEAP32[$25>>2]|0;
 $16 = $26;
 $27 = $16;
 $5 = $21;
 $28 = $5;
 $4 = $28;
 $29 = $4;
 $3 = $29;
 $30 = $3;
 $31 = ((($30)) + 8|0);
 $2 = $31;
 $32 = $2;
 $1 = $32;
 $33 = $1;
 $34 = HEAP32[$33>>2]|0;
 $35 = HEAP32[$29>>2]|0;
 $36 = $34;
 $37 = $35;
 $38 = (($36) - ($37))|0;
 $39 = (($38|0) / 24)&-1;
 $40 = (($27) + (($39*24)|0)|0);
 $7 = $21;
 $41 = $7;
 $42 = HEAP32[$41>>2]|0;
 $6 = $42;
 $43 = $6;
 $8 = $21;
 $44 = $8;
 $45 = ((($44)) + 4|0);
 $46 = HEAP32[$45>>2]|0;
 $47 = HEAP32[$44>>2]|0;
 $48 = $46;
 $49 = $47;
 $50 = (($48) - ($49))|0;
 $51 = (($50|0) / 24)&-1;
 $52 = (($43) + (($51*24)|0)|0);
 $10 = $21;
 $53 = $10;
 $54 = HEAP32[$53>>2]|0;
 $9 = $54;
 $55 = $9;
 $15 = $21;
 $56 = $15;
 $14 = $56;
 $57 = $14;
 $13 = $57;
 $58 = $13;
 $59 = ((($58)) + 8|0);
 $12 = $59;
 $60 = $12;
 $11 = $60;
 $61 = $11;
 $62 = HEAP32[$61>>2]|0;
 $63 = HEAP32[$57>>2]|0;
 $64 = $62;
 $65 = $63;
 $66 = (($64) - ($65))|0;
 $67 = (($66|0) / 24)&-1;
 $68 = (($55) + (($67*24)|0)|0);
 __ZNKSt3__26vectorI5BlockNS_9allocatorIS1_EEE31__annotate_contiguous_containerEPKvS6_S6_S6_($21,$24,$40,$52,$68);
 STACKTOP = sp;return;
}
function __ZNKSt3__26vectorI5BlockNS_9allocatorIS1_EEE14__annotate_newEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $20 = $0;
 $21 = $1;
 $22 = $20;
 $19 = $22;
 $23 = $19;
 $24 = HEAP32[$23>>2]|0;
 $18 = $24;
 $25 = $18;
 $17 = $22;
 $26 = $17;
 $27 = HEAP32[$26>>2]|0;
 $16 = $27;
 $28 = $16;
 $6 = $22;
 $29 = $6;
 $5 = $29;
 $30 = $5;
 $4 = $30;
 $31 = $4;
 $32 = ((($31)) + 8|0);
 $3 = $32;
 $33 = $3;
 $2 = $33;
 $34 = $2;
 $35 = HEAP32[$34>>2]|0;
 $36 = HEAP32[$30>>2]|0;
 $37 = $35;
 $38 = $36;
 $39 = (($37) - ($38))|0;
 $40 = (($39|0) / 24)&-1;
 $41 = (($28) + (($40*24)|0)|0);
 $8 = $22;
 $42 = $8;
 $43 = HEAP32[$42>>2]|0;
 $7 = $43;
 $44 = $7;
 $13 = $22;
 $45 = $13;
 $12 = $45;
 $46 = $12;
 $11 = $46;
 $47 = $11;
 $48 = ((($47)) + 8|0);
 $10 = $48;
 $49 = $10;
 $9 = $49;
 $50 = $9;
 $51 = HEAP32[$50>>2]|0;
 $52 = HEAP32[$46>>2]|0;
 $53 = $51;
 $54 = $52;
 $55 = (($53) - ($54))|0;
 $56 = (($55|0) / 24)&-1;
 $57 = (($44) + (($56*24)|0)|0);
 $15 = $22;
 $58 = $15;
 $59 = HEAP32[$58>>2]|0;
 $14 = $59;
 $60 = $14;
 $61 = $21;
 $62 = (($60) + (($61*24)|0)|0);
 __ZNKSt3__26vectorI5BlockNS_9allocatorIS1_EEE31__annotate_contiguous_containerEPKvS6_S6_S6_($22,$25,$41,$57,$62);
 STACKTOP = sp;return;
}
function __ZNKSt3__26vectorI5BlockNS_9allocatorIS1_EEE31__annotate_contiguous_containerEPKvS6_S6_S6_($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $8 = $3;
 $9 = $4;
 STACKTOP = sp;return;
}
function __ZN5BlockC2EOS_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $10 = $0;
 $11 = $1;
 $12 = $10;
 $13 = $11;
 ;HEAP32[$12>>2]=HEAP32[$13>>2]|0;HEAP32[$12+4>>2]=HEAP32[$13+4>>2]|0;HEAP32[$12+8>>2]=HEAP32[$13+8>>2]|0;
 $14 = ((($12)) + 12|0);
 $15 = $11;
 $16 = ((($15)) + 12|0);
 $8 = $14;
 $9 = $16;
 $17 = $8;
 $18 = $9;
 $7 = $18;
 $19 = $7;
 ;HEAP32[$17>>2]=HEAP32[$19>>2]|0;HEAP32[$17+4>>2]=HEAP32[$19+4>>2]|0;HEAP32[$17+8>>2]=HEAP32[$19+8>>2]|0;
 $20 = $9;
 $4 = $20;
 $21 = $4;
 $3 = $21;
 $22 = $3;
 $2 = $22;
 $23 = $2;
 $5 = $23;
 $6 = 0;
 while(1) {
  $24 = $6;
  $25 = ($24>>>0)<(3);
  if (!($25)) {
   break;
  }
  $26 = $5;
  $27 = $6;
  $28 = (($26) + ($27<<2)|0);
  HEAP32[$28>>2] = 0;
  $29 = $6;
  $30 = (($29) + 1)|0;
  $6 = $30;
 }
 STACKTOP = sp;return;
}
function __ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEE8__appendEjRKS1_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0;
 var $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0;
 var $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0;
 var $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0;
 var $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 256|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(256|0);
 $9 = sp + 8|0;
 $12 = sp + 242|0;
 $20 = sp + 176|0;
 $23 = sp + 164|0;
 $36 = sp;
 $41 = sp + 241|0;
 $50 = sp + 240|0;
 $58 = sp + 20|0;
 $54 = $0;
 $55 = $1;
 $56 = $2;
 $61 = $54;
 $53 = $61;
 $62 = $53;
 $63 = ((($62)) + 8|0);
 $52 = $63;
 $64 = $52;
 $51 = $64;
 $65 = $51;
 $66 = HEAP32[$65>>2]|0;
 $67 = ((($61)) + 4|0);
 $68 = HEAP32[$67>>2]|0;
 $69 = $66;
 $70 = $68;
 $71 = (($69) - ($70))|0;
 $72 = (($71|0) / 24)&-1;
 $73 = $55;
 $74 = ($72>>>0)>=($73>>>0);
 if ($74) {
  $75 = $55;
  $76 = $56;
  $46 = $61;
  $47 = $75;
  $48 = $76;
  $77 = $46;
  $45 = $77;
  $78 = $45;
  $79 = ((($78)) + 8|0);
  $44 = $79;
  $80 = $44;
  $43 = $80;
  $81 = $43;
  $49 = $81;
  while(1) {
   __ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEE24__RAII_IncreaseAnnotatorC2ERKS4_j($50,$77,1);
   $82 = $49;
   $83 = ((($77)) + 4|0);
   $84 = HEAP32[$83>>2]|0;
   $42 = $84;
   $85 = $42;
   $86 = $48;
   $38 = $82;
   $39 = $85;
   $40 = $86;
   $87 = $38;
   $88 = $39;
   $89 = $40;
   $37 = $89;
   $90 = $37;
   ;HEAP8[$36>>0]=HEAP8[$41>>0]|0;
   $33 = $87;
   $34 = $88;
   $35 = $90;
   $91 = $33;
   $92 = $34;
   $93 = $35;
   $32 = $93;
   $94 = $32;
   $29 = $91;
   $30 = $92;
   $31 = $94;
   $95 = $30;
   $96 = $31;
   $28 = $96;
   $97 = $28;
   __ZN5BlockC2ERKS_($95,$97);
   $98 = ((($77)) + 4|0);
   $99 = HEAP32[$98>>2]|0;
   $100 = ((($99)) + 24|0);
   HEAP32[$98>>2] = $100;
   $101 = $47;
   $102 = (($101) + -1)|0;
   $47 = $102;
   __ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEE24__RAII_IncreaseAnnotator6__doneEv($50);
   $103 = $47;
   $104 = ($103>>>0)>(0);
   if (!($104)) {
    break;
   }
  }
  STACKTOP = sp;return;
 }
 $27 = $61;
 $105 = $27;
 $106 = ((($105)) + 8|0);
 $26 = $106;
 $107 = $26;
 $25 = $107;
 $108 = $25;
 $57 = $108;
 $24 = $61;
 $109 = $24;
 $110 = ((($109)) + 4|0);
 $111 = HEAP32[$110>>2]|0;
 $112 = HEAP32[$109>>2]|0;
 $113 = $111;
 $114 = $112;
 $115 = (($113) - ($114))|0;
 $116 = (($115|0) / 24)&-1;
 $117 = $55;
 $118 = (($116) + ($117))|0;
 $19 = $61;
 HEAP32[$20>>2] = $118;
 $119 = $19;
 $120 = (__ZNKSt3__26vectorI5BlockNS_9allocatorIS1_EEE8max_sizeEv($119)|0);
 $21 = $120;
 $121 = HEAP32[$20>>2]|0;
 $122 = $21;
 $123 = ($121>>>0)>($122>>>0);
 if ($123) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($119);
  // unreachable;
 }
 $17 = $119;
 $124 = $17;
 $16 = $124;
 $125 = $16;
 $15 = $125;
 $126 = $15;
 $127 = ((($126)) + 8|0);
 $14 = $127;
 $128 = $14;
 $13 = $128;
 $129 = $13;
 $130 = HEAP32[$129>>2]|0;
 $131 = HEAP32[$125>>2]|0;
 $132 = $130;
 $133 = $131;
 $134 = (($132) - ($133))|0;
 $135 = (($134|0) / 24)&-1;
 $22 = $135;
 $136 = $22;
 $137 = $21;
 $138 = (($137>>>0) / 2)&-1;
 $139 = ($136>>>0)>=($138>>>0);
 if ($139) {
  $140 = $21;
  $18 = $140;
 } else {
  $141 = $22;
  $142 = $141<<1;
  HEAP32[$23>>2] = $142;
  $10 = $23;
  $11 = $20;
  $143 = $10;
  $144 = $11;
  ;HEAP8[$9>>0]=HEAP8[$12>>0]|0;
  $7 = $143;
  $8 = $144;
  $145 = $7;
  $146 = $8;
  $4 = $9;
  $5 = $145;
  $6 = $146;
  $147 = $5;
  $148 = HEAP32[$147>>2]|0;
  $149 = $6;
  $150 = HEAP32[$149>>2]|0;
  $151 = ($148>>>0)<($150>>>0);
  $152 = $8;
  $153 = $7;
  $154 = $151 ? $152 : $153;
  $155 = HEAP32[$154>>2]|0;
  $18 = $155;
 }
 $156 = $18;
 $3 = $61;
 $157 = $3;
 $158 = ((($157)) + 4|0);
 $159 = HEAP32[$158>>2]|0;
 $160 = HEAP32[$157>>2]|0;
 $161 = $159;
 $162 = $160;
 $163 = (($161) - ($162))|0;
 $164 = (($163|0) / 24)&-1;
 $165 = $57;
 __ZNSt3__214__split_bufferI5BlockRNS_9allocatorIS1_EEEC2EjjS4_($58,$156,$164,$165);
 $166 = $55;
 $167 = $56;
 __THREW__ = 0;
 invoke_viii(110,($58|0),($166|0),($167|0));
 $168 = __THREW__; __THREW__ = 0;
 $169 = $168&1;
 if ($169) {
  $172 = ___cxa_find_matching_catch_2()|0;
  $173 = tempRet0;
  $59 = $172;
  $60 = $173;
  __ZNSt3__214__split_bufferI5BlockRNS_9allocatorIS1_EEED2Ev($58);
  $174 = $59;
  $175 = $60;
  ___resumeException($174|0);
  // unreachable;
 }
 __THREW__ = 0;
 invoke_vii(109,($61|0),($58|0));
 $170 = __THREW__; __THREW__ = 0;
 $171 = $170&1;
 if ($171) {
  $172 = ___cxa_find_matching_catch_2()|0;
  $173 = tempRet0;
  $59 = $172;
  $60 = $173;
  __ZNSt3__214__split_bufferI5BlockRNS_9allocatorIS1_EEED2Ev($58);
  $174 = $59;
  $175 = $60;
  ___resumeException($174|0);
  // unreachable;
 }
 __ZNSt3__214__split_bufferI5BlockRNS_9allocatorIS1_EEED2Ev($58);
 STACKTOP = sp;return;
}
function __ZNSt3__214__split_bufferI5BlockRNS_9allocatorIS1_EEE18__construct_at_endEjRKS1_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 96|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(96|0);
 $12 = sp;
 $17 = sp + 84|0;
 $21 = $0;
 $22 = $1;
 $23 = $2;
 $25 = $21;
 $20 = $25;
 $26 = $20;
 $27 = ((($26)) + 12|0);
 $19 = $27;
 $28 = $19;
 $18 = $28;
 $29 = $18;
 $30 = ((($29)) + 4|0);
 $31 = HEAP32[$30>>2]|0;
 $24 = $31;
 while(1) {
  $32 = $24;
  $33 = ((($25)) + 8|0);
  $34 = HEAP32[$33>>2]|0;
  $3 = $34;
  $35 = $3;
  $36 = $23;
  $14 = $32;
  $15 = $35;
  $16 = $36;
  $37 = $14;
  $38 = $15;
  $39 = $16;
  $13 = $39;
  $40 = $13;
  ;HEAP8[$12>>0]=HEAP8[$17>>0]|0;
  $9 = $37;
  $10 = $38;
  $11 = $40;
  $41 = $9;
  $42 = $10;
  $43 = $11;
  $8 = $43;
  $44 = $8;
  $5 = $41;
  $6 = $42;
  $7 = $44;
  $45 = $6;
  $46 = $7;
  $4 = $46;
  $47 = $4;
  __ZN5BlockC2ERKS_($45,$47);
  $48 = ((($25)) + 8|0);
  $49 = HEAP32[$48>>2]|0;
  $50 = ((($49)) + 24|0);
  HEAP32[$48>>2] = $50;
  $51 = $22;
  $52 = (($51) + -1)|0;
  $22 = $52;
  $53 = $22;
  $54 = ($53>>>0)>(0);
  if (!($54)) {
   break;
  }
 }
 STACKTOP = sp;return;
}
function __ZNKSt3__26vectorI5BlockNS_9allocatorIS1_EEE17__annotate_shrinkEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $16 = $0;
 $17 = $1;
 $18 = $16;
 $15 = $18;
 $19 = $15;
 $20 = HEAP32[$19>>2]|0;
 $14 = $20;
 $21 = $14;
 $13 = $18;
 $22 = $13;
 $23 = HEAP32[$22>>2]|0;
 $12 = $23;
 $24 = $12;
 $6 = $18;
 $25 = $6;
 $5 = $25;
 $26 = $5;
 $4 = $26;
 $27 = $4;
 $28 = ((($27)) + 8|0);
 $3 = $28;
 $29 = $3;
 $2 = $29;
 $30 = $2;
 $31 = HEAP32[$30>>2]|0;
 $32 = HEAP32[$26>>2]|0;
 $33 = $31;
 $34 = $32;
 $35 = (($33) - ($34))|0;
 $36 = (($35|0) / 24)&-1;
 $37 = (($24) + (($36*24)|0)|0);
 $8 = $18;
 $38 = $8;
 $39 = HEAP32[$38>>2]|0;
 $7 = $39;
 $40 = $7;
 $41 = $17;
 $42 = (($40) + (($41*24)|0)|0);
 $10 = $18;
 $43 = $10;
 $44 = HEAP32[$43>>2]|0;
 $9 = $44;
 $45 = $9;
 $11 = $18;
 $46 = $11;
 $47 = ((($46)) + 4|0);
 $48 = HEAP32[$47>>2]|0;
 $49 = HEAP32[$46>>2]|0;
 $50 = $48;
 $51 = $49;
 $52 = (($50) - ($51))|0;
 $53 = (($52|0) / 24)&-1;
 $54 = (($45) + (($53*24)|0)|0);
 __ZNKSt3__26vectorI5BlockNS_9allocatorIS1_EEE31__annotate_contiguous_containerEPKvS6_S6_S6_($18,$21,$37,$42,$54);
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal11NoBaseClass6verifyINSt3__26vectorI5BlockNS3_9allocatorIS5_EEEEEEvv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN10emscripten8internal13getActualTypeINSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEEEPKvPT_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = (__ZN10emscripten8internal14getLightTypeIDINSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEEEPKvRKT_($2)|0);
 STACKTOP = sp;return ($3|0);
}
function __ZN10emscripten8internal11NoBaseClass11getUpcasterINSt3__26vectorI5BlockNS3_9allocatorIS5_EEEEEEPFvvEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (0|0);
}
function __ZN10emscripten8internal11NoBaseClass13getDowncasterINSt3__26vectorI5BlockNS3_9allocatorIS5_EEEEEEPFvvEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (0|0);
}
function __ZN10emscripten8internal14raw_destructorINSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEEEvPT_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ($2|0)==(0|0);
 if ($3) {
  STACKTOP = sp;return;
 }
 __ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEED2Ev($2);
 __ZdlPv($2);
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal6TypeIDINSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerINSt3__26vectorI5BlockNS3_9allocatorIS5_EEEEEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIPNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerIKNSt3__26vectorI5BlockNS3_9allocatorIS5_EEEEEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIPKNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal11NoBaseClass3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (0|0);
}
function __ZN10emscripten8internal14getLightTypeIDINSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEEEPKvRKT_($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return (88|0);
}
function __ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 __ZNSt3__213__vector_baseI5BlockNS_9allocatorIS1_EEED2Ev($2);
 STACKTOP = sp;return;
}
function __ZNSt3__213__vector_baseI5BlockNS_9allocatorIS1_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 128|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(128|0);
 $19 = sp;
 $22 = sp + 116|0;
 $30 = $0;
 $31 = $30;
 $32 = HEAP32[$31>>2]|0;
 $33 = ($32|0)!=(0|0);
 if (!($33)) {
  STACKTOP = sp;return;
 }
 $29 = $31;
 $34 = $29;
 $35 = HEAP32[$34>>2]|0;
 $27 = $34;
 $28 = $35;
 $36 = $27;
 while(1) {
  $37 = $28;
  $38 = ((($36)) + 4|0);
  $39 = HEAP32[$38>>2]|0;
  $40 = ($37|0)!=($39|0);
  if (!($40)) {
   break;
  }
  $26 = $36;
  $41 = $26;
  $42 = ((($41)) + 8|0);
  $25 = $42;
  $43 = $25;
  $24 = $43;
  $44 = $24;
  $45 = ((($36)) + 4|0);
  $46 = HEAP32[$45>>2]|0;
  $47 = ((($46)) + -24|0);
  HEAP32[$45>>2] = $47;
  $23 = $47;
  $48 = $23;
  $20 = $44;
  $21 = $48;
  $49 = $20;
  $50 = $21;
  ;HEAP8[$19>>0]=HEAP8[$22>>0]|0;
  $17 = $49;
  $18 = $50;
  $51 = $17;
  $52 = $18;
  $15 = $51;
  $16 = $52;
  $53 = $16;
  __ZN5BlockD2Ev($53);
 }
 $14 = $31;
 $54 = $14;
 $55 = ((($54)) + 8|0);
 $13 = $55;
 $56 = $13;
 $12 = $56;
 $57 = $12;
 $58 = HEAP32[$31>>2]|0;
 $4 = $31;
 $59 = $4;
 $3 = $59;
 $60 = $3;
 $61 = ((($60)) + 8|0);
 $2 = $61;
 $62 = $2;
 $1 = $62;
 $63 = $1;
 $64 = HEAP32[$63>>2]|0;
 $65 = HEAP32[$59>>2]|0;
 $66 = $64;
 $67 = $65;
 $68 = (($66) - ($67))|0;
 $69 = (($68|0) / 24)&-1;
 $9 = $57;
 $10 = $58;
 $11 = $69;
 $70 = $9;
 $71 = $10;
 $72 = $11;
 $6 = $70;
 $7 = $71;
 $8 = $72;
 $73 = $7;
 $5 = $73;
 $74 = $5;
 __ZdlPv($74);
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal11LightTypeIDINSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (88|0);
}
function __ZN10emscripten8internal11LightTypeIDIPNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (112|0);
}
function __ZN10emscripten8internal11LightTypeIDIPKNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (128|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (2116|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJvEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (2119|0);
}
function __ZN10emscripten8internal12operator_newINSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEJEEEPT_DpOT0_() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $3 = sp + 24|0;
 $6 = sp + 12|0;
 $10 = (__Znwj(12)|0);
 $9 = $10;
 $11 = $9;
 $8 = $11;
 $12 = $8;
 $7 = $12;
 HEAP32[$12>>2] = 0;
 $13 = ((($12)) + 4|0);
 HEAP32[$13>>2] = 0;
 $14 = ((($12)) + 8|0);
 $5 = $14;
 HEAP32[$6>>2] = 0;
 $15 = $5;
 $4 = $6;
 $16 = $4;
 $17 = HEAP32[$16>>2]|0;
 $2 = $15;
 HEAP32[$3>>2] = $17;
 $18 = $2;
 $1 = $18;
 $0 = $3;
 $19 = $0;
 $20 = HEAP32[$19>>2]|0;
 HEAP32[$18>>2] = $20;
 STACKTOP = sp;return ($10|0);
}
function __ZN10emscripten8internal7InvokerIPNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEJEE6invokeEPFS8_vE($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = (FUNCTION_TABLE_i[$2 & 127]()|0);
 $4 = (__ZN10emscripten8internal11BindingTypeIPNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE10toWireTypeES8_($3)|0);
 STACKTOP = sp;return ($4|0);
}
function __ZNK10emscripten8internal12WithPoliciesIJNS_18allow_raw_pointersEEE11ArgTypeListIJPNSt3__26vectorI5BlockNS5_9allocatorIS7_EEEEEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 1;
}
function __ZNK10emscripten8internal12WithPoliciesIJNS_18allow_raw_pointersEEE11ArgTypeListIJPNSt3__26vectorI5BlockNS5_9allocatorIS7_EEEEEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJNS0_17AllowedRawPointerINSt3__26vectorI5BlockNS4_9allocatorIS6_EEEEEEEEEE3getEv()|0);
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal11BindingTypeIPNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE10toWireTypeES8_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJNS0_17AllowedRawPointerINSt3__26vectorI5BlockNS4_9allocatorIS6_EEEEEEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (804|0);
}
function __ZN10emscripten8internal13MethodInvokerIMNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEFvRKS4_EvPS7_JS9_EE6invokeERKSB_SC_PS4_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $4;
 $7 = (__ZN10emscripten8internal11BindingTypeIPNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE12fromWireTypeES8_($6)|0);
 $8 = $3;
 $$field = HEAP32[$8>>2]|0;
 $$index1 = ((($8)) + 4|0);
 $$field2 = HEAP32[$$index1>>2]|0;
 $9 = $$field2 >> 1;
 $10 = (($7) + ($9)|0);
 $11 = $$field2 & 1;
 $12 = ($11|0)!=(0);
 if ($12) {
  $13 = HEAP32[$10>>2]|0;
  $14 = (($13) + ($$field)|0);
  $15 = HEAP32[$14>>2]|0;
  $19 = $15;
 } else {
  $16 = $$field;
  $19 = $16;
 }
 $17 = $5;
 $18 = (__ZN10emscripten8internal18GenericBindingTypeI5BlockE12fromWireTypeEPS2_($17)|0);
 FUNCTION_TABLE_vii[$19 & 127]($10,$18);
 STACKTOP = sp;return;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerINSt3__26vectorI5BlockNS5_9allocatorIS7_EEEEEERKS7_EE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 3;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerINSt3__26vectorI5BlockNS5_9allocatorIS7_EEEEEERKS7_EE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvNS0_17AllowedRawPointerINSt3__26vectorI5BlockNS4_9allocatorIS6_EEEEEERKS6_EEEE3getEv()|0);
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal10getContextIMNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEFvRKS4_EEEPT_RKSC_($0) {
 $0 = $0|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $$index5 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(8)|0);
 $3 = $1;
 $$field = HEAP32[$3>>2]|0;
 $$index1 = ((($3)) + 4|0);
 $$field2 = HEAP32[$$index1>>2]|0;
 HEAP32[$2>>2] = $$field;
 $$index5 = ((($2)) + 4|0);
 HEAP32[$$index5>>2] = $$field2;
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal11BindingTypeIPNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE12fromWireTypeES8_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal18GenericBindingTypeI5BlockE12fromWireTypeEPS2_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvNS0_17AllowedRawPointerINSt3__26vectorI5BlockNS4_9allocatorIS6_EEEEEERKS6_EEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (808|0);
}
function __ZN10emscripten8internal13MethodInvokerIMNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEFvjRKS4_EvPS7_JjS9_EE6invokeERKSB_SC_jPS4_($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $4 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $8 = $5;
 $9 = (__ZN10emscripten8internal11BindingTypeIPNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE12fromWireTypeES8_($8)|0);
 $10 = $4;
 $$field = HEAP32[$10>>2]|0;
 $$index1 = ((($10)) + 4|0);
 $$field2 = HEAP32[$$index1>>2]|0;
 $11 = $$field2 >> 1;
 $12 = (($9) + ($11)|0);
 $13 = $$field2 & 1;
 $14 = ($13|0)!=(0);
 if ($14) {
  $15 = HEAP32[$12>>2]|0;
  $16 = (($15) + ($$field)|0);
  $17 = HEAP32[$16>>2]|0;
  $23 = $17;
 } else {
  $18 = $$field;
  $23 = $18;
 }
 $19 = $6;
 $20 = (__ZN10emscripten8internal11BindingTypeIjE12fromWireTypeEj($19)|0);
 $21 = $7;
 $22 = (__ZN10emscripten8internal18GenericBindingTypeI5BlockE12fromWireTypeEPS2_($21)|0);
 FUNCTION_TABLE_viii[$23 & 127]($12,$20,$22);
 STACKTOP = sp;return;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerINSt3__26vectorI5BlockNS5_9allocatorIS7_EEEEEEjRKS7_EE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 4;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerINSt3__26vectorI5BlockNS5_9allocatorIS7_EEEEEEjRKS7_EE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvNS0_17AllowedRawPointerINSt3__26vectorI5BlockNS4_9allocatorIS6_EEEEEEjRKS6_EEEE3getEv()|0);
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal10getContextIMNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEFvjRKS4_EEEPT_RKSC_($0) {
 $0 = $0|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $$index5 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(8)|0);
 $3 = $1;
 $$field = HEAP32[$3>>2]|0;
 $$index1 = ((($3)) + 4|0);
 $$field2 = HEAP32[$$index1>>2]|0;
 HEAP32[$2>>2] = $$field;
 $$index5 = ((($2)) + 4|0);
 HEAP32[$$index5>>2] = $$field2;
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal11BindingTypeIjE12fromWireTypeEj($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvNS0_17AllowedRawPointerINSt3__26vectorI5BlockNS4_9allocatorIS6_EEEEEEjRKS6_EEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (820|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJviiiiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (2121|0);
}
function __ZN10emscripten8internal13MethodInvokerIMNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEKFjvEjPKS7_JEE6invokeERKS9_SB_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = sp;
 $2 = $0;
 $3 = $1;
 $5 = $3;
 $6 = (__ZN10emscripten8internal11BindingTypeIPKNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE12fromWireTypeES9_($5)|0);
 $7 = $2;
 $$field = HEAP32[$7>>2]|0;
 $$index1 = ((($7)) + 4|0);
 $$field2 = HEAP32[$$index1>>2]|0;
 $8 = $$field2 >> 1;
 $9 = (($6) + ($8)|0);
 $10 = $$field2 & 1;
 $11 = ($10|0)!=(0);
 if ($11) {
  $12 = HEAP32[$9>>2]|0;
  $13 = (($12) + ($$field)|0);
  $14 = HEAP32[$13>>2]|0;
  $16 = $14;
 } else {
  $15 = $$field;
  $16 = $15;
 }
 $17 = (FUNCTION_TABLE_ii[$16 & 127]($9)|0);
 HEAP32[$4>>2] = $17;
 $18 = (__ZN10emscripten8internal11BindingTypeIjE10toWireTypeERKj($4)|0);
 STACKTOP = sp;return ($18|0);
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJjNS0_17AllowedRawPointerIKNSt3__26vectorI5BlockNS5_9allocatorIS7_EEEEEEEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 2;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJjNS0_17AllowedRawPointerIKNSt3__26vectorI5BlockNS5_9allocatorIS7_EEEEEEEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJjNS0_17AllowedRawPointerIKNSt3__26vectorI5BlockNS4_9allocatorIS6_EEEEEEEEEE3getEv()|0);
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal10getContextIMNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEKFjvEEEPT_RKSA_($0) {
 $0 = $0|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $$index5 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(8)|0);
 $3 = $1;
 $$field = HEAP32[$3>>2]|0;
 $$index1 = ((($3)) + 4|0);
 $$field2 = HEAP32[$$index1>>2]|0;
 HEAP32[$2>>2] = $$field;
 $$index5 = ((($2)) + 4|0);
 HEAP32[$$index5>>2] = $$field2;
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal11BindingTypeIjE10toWireTypeERKj($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 STACKTOP = sp;return ($3|0);
}
function __ZN10emscripten8internal11BindingTypeIPKNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE12fromWireTypeES9_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJjNS0_17AllowedRawPointerIKNSt3__26vectorI5BlockNS4_9allocatorIS6_EEEEEEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (836|0);
}
function __ZN10emscripten8internal15FunctionInvokerIPFNS_3valERKNSt3__26vectorI5BlockNS3_9allocatorIS5_EEEEjES2_SA_JjEE6invokeEPSC_PS8_j($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $6 = sp + 8|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $9 = $3;
 $10 = HEAP32[$9>>2]|0;
 $11 = $4;
 $12 = (__ZN10emscripten8internal18GenericBindingTypeINSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE12fromWireTypeEPS7_($11)|0);
 $13 = $5;
 $14 = (__ZN10emscripten8internal11BindingTypeIjE12fromWireTypeEj($13)|0);
 $15 = (FUNCTION_TABLE_iii[$10 & 127]($12,$14)|0);
 HEAP32[$6>>2] = $15;
 __THREW__ = 0;
 $16 = (invoke_ii(111,($6|0))|0);
 $17 = __THREW__; __THREW__ = 0;
 $18 = $17&1;
 if ($18) {
  $19 = ___cxa_find_matching_catch_2()|0;
  $20 = tempRet0;
  $7 = $19;
  $8 = $20;
  __ZN10emscripten3valD2Ev($6);
  $21 = $7;
  $22 = $8;
  ___resumeException($21|0);
  // unreachable;
 } else {
  __ZN10emscripten3valD2Ev($6);
  STACKTOP = sp;return ($16|0);
 }
 return (0)|0;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJNS_3valERKNSt3__26vectorI5BlockNS5_9allocatorIS7_EEEEjEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 3;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJNS_3valERKNSt3__26vectorI5BlockNS5_9allocatorIS7_EEEEjEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJNS_3valERKNSt3__26vectorI5BlockNS4_9allocatorIS6_EEEEjEEEE3getEv()|0);
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal10getContextIPFNS_3valERKNSt3__26vectorI5BlockNS3_9allocatorIS5_EEEEjEEEPT_RKSD_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(4)|0);
 $3 = $1;
 $4 = HEAP32[$3>>2]|0;
 HEAP32[$2>>2] = $4;
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal11BindingTypeINS_3valEE10toWireTypeERKS2_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = HEAP32[$2>>2]|0;
 __emval_incref(($3|0));
 $4 = $1;
 $5 = HEAP32[$4>>2]|0;
 STACKTOP = sp;return ($5|0);
}
function __ZN10emscripten8internal18GenericBindingTypeINSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE12fromWireTypeEPS7_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJNS_3valERKNSt3__26vectorI5BlockNS4_9allocatorIS6_EEEEjEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (844|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJiiiiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (2146|0);
}
function __ZN10emscripten3valC2IRK5BlockEEOT_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = sp;
 $3 = $0;
 $4 = $1;
 $6 = $3;
 $7 = $4;
 $2 = $7;
 $8 = $2;
 __ZN10emscripten8internal12WireTypePackIJRK5BlockEEC2ES4_($5,$8);
 $9 = (__ZN10emscripten8internal6TypeIDIRK5BlockE3getEv()|0);
 $10 = (__ZNK10emscripten8internal12WireTypePackIJRK5BlockEEcvPKvEv($5)|0);
 $11 = (__emval_take_value(($9|0),($10|0))|0);
 HEAP32[$6>>2] = $11;
 STACKTOP = sp;return;
}
function __ZN10emscripten3val9undefinedEv() {
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $0 = sp;
 __ZN10emscripten3valC2EPNS_8internal7_EM_VALE($0,(1));
 $1 = HEAP32[$0>>2]|0;
 STACKTOP = sp;return ($1|0);
}
function __ZN10emscripten8internal12WireTypePackIJRK5BlockEEC2ES4_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $9 = sp;
 $7 = $0;
 $8 = $1;
 $10 = $7;
 $6 = $10;
 $11 = $6;
 HEAP32[$9>>2] = $11;
 $12 = $8;
 $2 = $12;
 $13 = $2;
 $4 = $9;
 $5 = $13;
 $14 = $4;
 $15 = $5;
 $3 = $15;
 $16 = $3;
 $17 = (__ZN10emscripten8internal18GenericBindingTypeI5BlockE10toWireTypeERKS2_($16)|0);
 __ZN10emscripten8internal20writeGenericWireTypeI5BlockEEvRPNS0_15GenericWireTypeEPT_($14,$17);
 $18 = $4;
 __ZN10emscripten8internal21writeGenericWireTypesERPNS0_15GenericWireTypeE($18);
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal6TypeIDIRK5BlockE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIRK5BlockE3getEv()|0);
 return ($0|0);
}
function __ZNK10emscripten8internal12WireTypePackIJRK5BlockEEcvPKvEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $2;
 $1 = $3;
 $4 = $1;
 STACKTOP = sp;return ($4|0);
}
function __ZN10emscripten8internal20writeGenericWireTypeI5BlockEEvRPNS0_15GenericWireTypeEPT_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3;
 $5 = $2;
 $6 = HEAP32[$5>>2]|0;
 HEAP32[$6>>2] = $4;
 $7 = $2;
 $8 = HEAP32[$7>>2]|0;
 $9 = ((($8)) + 8|0);
 HEAP32[$7>>2] = $9;
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal18GenericBindingTypeI5BlockE10toWireTypeERKS2_($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $4 = (__Znwj(24)|0);
 $5 = $1;
 __THREW__ = 0;
 invoke_vii(51,($4|0),($5|0));
 $6 = __THREW__; __THREW__ = 0;
 $7 = $6&1;
 if ($7) {
  $8 = ___cxa_find_matching_catch_2()|0;
  $9 = tempRet0;
  $2 = $8;
  $3 = $9;
  __ZdlPv($4);
  $10 = $2;
  $11 = $3;
  ___resumeException($10|0);
  // unreachable;
 } else {
  STACKTOP = sp;return ($4|0);
 }
 return (0)|0;
}
function __ZN10emscripten8internal11LightTypeIDIRK5BlockE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (16|0);
}
function __ZN10emscripten8internal15FunctionInvokerIPFbRNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEjRKS4_EbS8_JjSA_EE6invokeEPSC_PS7_jPS4_($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $8 = $4;
 $9 = HEAP32[$8>>2]|0;
 $10 = $5;
 $11 = (__ZN10emscripten8internal18GenericBindingTypeINSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE12fromWireTypeEPS7_($10)|0);
 $12 = $6;
 $13 = (__ZN10emscripten8internal11BindingTypeIjE12fromWireTypeEj($12)|0);
 $14 = $7;
 $15 = (__ZN10emscripten8internal18GenericBindingTypeI5BlockE12fromWireTypeEPS2_($14)|0);
 $16 = (FUNCTION_TABLE_iiii[$9 & 127]($11,$13,$15)|0);
 $17 = (__ZN10emscripten8internal11BindingTypeIbE10toWireTypeEb($16)|0);
 STACKTOP = sp;return ($17|0);
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJbRNSt3__26vectorI5BlockNS4_9allocatorIS6_EEEEjRKS6_EE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 4;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJbRNSt3__26vectorI5BlockNS4_9allocatorIS6_EEEEjRKS6_EE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJbRNSt3__26vectorI5BlockNS3_9allocatorIS5_EEEEjRKS5_EEEE3getEv()|0);
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal10getContextIPFbRNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEjRKS4_EEEPT_RKSD_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(4)|0);
 $3 = $1;
 $4 = HEAP32[$3>>2]|0;
 HEAP32[$2>>2] = $4;
 STACKTOP = sp;return ($2|0);
}
function __ZN10emscripten8internal11BindingTypeIbE10toWireTypeEb($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0&1;
 $1 = $2;
 $3 = $1;
 $4 = $3&1;
 STACKTOP = sp;return ($4|0);
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJbRNSt3__26vectorI5BlockNS3_9allocatorIS5_EEEEjRKS5_EEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (856|0);
}
function __ZN10emscripten8internal19getGenericSignatureIJiiiiiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (2151|0);
}
function __ZN5BlockaSERKS_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2;
 $5 = $3;
 ;HEAP32[$4>>2]=HEAP32[$5>>2]|0;HEAP32[$4+4>>2]=HEAP32[$5+4>>2]|0;HEAP32[$4+8>>2]=HEAP32[$5+8>>2]|0;
 $6 = ((($4)) + 12|0);
 $7 = $3;
 $8 = ((($7)) + 12|0);
 (__ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEaSERKS5_($6,$8)|0);
 STACKTOP = sp;return ($4|0);
}
function __ZN10emscripten8internal7InvokerINS_3valEJNSt3__26vectorI5BlockNS3_9allocatorIS5_EEEEEE6invokeEPFS2_S8_EPS8_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = sp + 20|0;
 $5 = sp + 8|0;
 $2 = $0;
 $3 = $1;
 $8 = $2;
 $9 = $3;
 $10 = (__ZN10emscripten8internal18GenericBindingTypeINSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE12fromWireTypeEPS7_($9)|0);
 __ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEEC2ERKS4_($5,$10);
 __THREW__ = 0;
 $11 = (invoke_ii($8|0,($5|0))|0);
 $12 = __THREW__; __THREW__ = 0;
 $13 = $12&1;
 if ($13) {
  $17 = ___cxa_find_matching_catch_2()|0;
  $18 = tempRet0;
  $6 = $17;
  $7 = $18;
  __ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEED2Ev($5);
  $21 = $6;
  $22 = $7;
  ___resumeException($21|0);
  // unreachable;
 }
 HEAP32[$4>>2] = $11;
 __THREW__ = 0;
 $14 = (invoke_ii(111,($4|0))|0);
 $15 = __THREW__; __THREW__ = 0;
 $16 = $15&1;
 if (!($16)) {
  __ZN10emscripten3valD2Ev($4);
  __ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEED2Ev($5);
  STACKTOP = sp;return ($14|0);
 }
 $19 = ___cxa_find_matching_catch_2()|0;
 $20 = tempRet0;
 $6 = $19;
 $7 = $20;
 __ZN10emscripten3valD2Ev($4);
 __ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEED2Ev($5);
 $21 = $6;
 $22 = $7;
 ___resumeException($21|0);
 // unreachable;
 return (0)|0;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJNS_3valENSt3__26vectorI5BlockNS5_9allocatorIS7_EEEEEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 2;
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJNS_3valENSt3__26vectorI5BlockNS5_9allocatorIS7_EEEEEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJNS_3valENSt3__26vectorI5BlockNS4_9allocatorIS6_EEEEEEEE3getEv()|0);
 STACKTOP = sp;return ($2|0);
}
function __ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEEC2ERKS4_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0;
 var $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 112|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(112|0);
 $7 = sp + 84|0;
 $8 = sp + 16|0;
 $11 = sp + 72|0;
 $12 = sp + 111|0;
 $13 = sp + 8|0;
 $17 = sp + 110|0;
 $19 = sp;
 $21 = sp + 109|0;
 $27 = sp + 108|0;
 $25 = $0;
 $26 = $1;
 $31 = $25;
 $32 = $26;
 $24 = $32;
 $33 = $24;
 $34 = ((($33)) + 8|0);
 $23 = $34;
 $35 = $23;
 $22 = $35;
 $36 = $22;
 $20 = $36;
 $37 = $20;
 ;HEAP8[$19>>0]=HEAP8[$21>>0]|0;
 $18 = $37;
 $15 = $31;
 $16 = $27;
 $38 = $15;
 $14 = $38;
 HEAP32[$38>>2] = 0;
 $39 = ((($38)) + 4|0);
 HEAP32[$39>>2] = 0;
 $40 = ((($38)) + 8|0);
 ;HEAP8[$13>>0]=HEAP8[$17>>0]|0;
 $10 = $40;
 HEAP32[$11>>2] = 0;
 $41 = $10;
 $9 = $11;
 $42 = $9;
 $43 = HEAP32[$42>>2]|0;
 $3 = $13;
 ;HEAP8[$8>>0]=HEAP8[$12>>0]|0;
 $6 = $41;
 HEAP32[$7>>2] = $43;
 $44 = $6;
 $5 = $8;
 $4 = $7;
 $45 = $4;
 $46 = HEAP32[$45>>2]|0;
 HEAP32[$44>>2] = $46;
 $47 = $26;
 $2 = $47;
 $48 = $2;
 $49 = ((($48)) + 4|0);
 $50 = HEAP32[$49>>2]|0;
 $51 = HEAP32[$48>>2]|0;
 $52 = $50;
 $53 = $51;
 $54 = (($52) - ($53))|0;
 $55 = (($54|0) / 24)&-1;
 $28 = $55;
 $56 = $28;
 $57 = ($56>>>0)>(0);
 if (!($57)) {
  STACKTOP = sp;return;
 }
 $58 = $28;
 __THREW__ = 0;
 invoke_vii(112,($31|0),($58|0));
 $59 = __THREW__; __THREW__ = 0;
 $60 = $59&1;
 if ($60) {
  $69 = ___cxa_find_matching_catch_2()|0;
  $70 = tempRet0;
  $29 = $69;
  $30 = $70;
  __ZNSt3__213__vector_baseI5BlockNS_9allocatorIS1_EEED2Ev($31);
  $71 = $29;
  $72 = $30;
  ___resumeException($71|0);
  // unreachable;
 }
 $61 = $26;
 $62 = HEAP32[$61>>2]|0;
 $63 = $26;
 $64 = ((($63)) + 4|0);
 $65 = HEAP32[$64>>2]|0;
 $66 = $28;
 __THREW__ = 0;
 invoke_viiii(113,($31|0),($62|0),($65|0),($66|0));
 $67 = __THREW__; __THREW__ = 0;
 $68 = $67&1;
 if ($68) {
  $69 = ___cxa_find_matching_catch_2()|0;
  $70 = tempRet0;
  $29 = $69;
  $30 = $70;
  __ZNSt3__213__vector_baseI5BlockNS_9allocatorIS1_EEED2Ev($31);
  $71 = $29;
  $72 = $30;
  ___resumeException($71|0);
  // unreachable;
 } else {
  STACKTOP = sp;return;
 }
}
function __ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEE8allocateEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $15 = $0;
 $16 = $1;
 $17 = $15;
 $18 = $16;
 $19 = (__ZNKSt3__26vectorI5BlockNS_9allocatorIS1_EEE8max_sizeEv($17)|0);
 $20 = ($18>>>0)>($19>>>0);
 if ($20) {
  __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($17);
  // unreachable;
 }
 $14 = $17;
 $21 = $14;
 $22 = ((($21)) + 8|0);
 $13 = $22;
 $23 = $13;
 $12 = $23;
 $24 = $12;
 $25 = $16;
 $10 = $24;
 $11 = $25;
 $26 = $10;
 $27 = $11;
 $7 = $26;
 $8 = $27;
 $9 = 0;
 $28 = $7;
 $29 = $8;
 $6 = $28;
 $30 = ($29>>>0)>(178956970);
 if ($30) {
  $31 = (___cxa_allocate_exception(4)|0);
  __ZNSt9bad_allocC2Ev($31);
  ___cxa_throw(($31|0),(360|0),(18|0));
  // unreachable;
 } else {
  $32 = $8;
  $33 = ($32*24)|0;
  $5 = $33;
  $34 = $5;
  $35 = (__Znwj($34)|0);
  $36 = ((($17)) + 4|0);
  HEAP32[$36>>2] = $35;
  HEAP32[$17>>2] = $35;
  $37 = HEAP32[$17>>2]|0;
  $38 = $16;
  $39 = (($37) + (($38*24)|0)|0);
  $4 = $17;
  $40 = $4;
  $41 = ((($40)) + 8|0);
  $3 = $41;
  $42 = $3;
  $2 = $42;
  $43 = $2;
  HEAP32[$43>>2] = $39;
  __ZNKSt3__26vectorI5BlockNS_9allocatorIS1_EEE14__annotate_newEj($17,0);
  STACKTOP = sp;return;
 }
}
function __ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEE18__construct_at_endIPS1_EENS_9enable_ifIXsr21__is_forward_iteratorIT_EE5valueEvE4typeES8_S8_j($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 112|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(112|0);
 $12 = sp;
 $17 = sp + 105|0;
 $31 = sp + 104|0;
 $26 = $0;
 $27 = $1;
 $28 = $2;
 $29 = $3;
 $32 = $26;
 $25 = $32;
 $33 = $25;
 $34 = ((($33)) + 8|0);
 $24 = $34;
 $35 = $24;
 $23 = $35;
 $36 = $23;
 $30 = $36;
 $37 = $29;
 __ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEE24__RAII_IncreaseAnnotatorC2ERKS4_j($31,$32,$37);
 $38 = $30;
 $39 = $27;
 $40 = $28;
 $41 = ((($32)) + 4|0);
 $19 = $38;
 $20 = $39;
 $21 = $40;
 $22 = $41;
 while(1) {
  $42 = $20;
  $43 = $21;
  $44 = ($42|0)!=($43|0);
  if (!($44)) {
   break;
  }
  $45 = $19;
  $46 = $22;
  $47 = HEAP32[$46>>2]|0;
  $18 = $47;
  $48 = $18;
  $49 = $20;
  $14 = $45;
  $15 = $48;
  $16 = $49;
  $50 = $14;
  $51 = $15;
  $52 = $16;
  $13 = $52;
  $53 = $13;
  ;HEAP8[$12>>0]=HEAP8[$17>>0]|0;
  $9 = $50;
  $10 = $51;
  $11 = $53;
  $54 = $9;
  $55 = $10;
  $56 = $11;
  $8 = $56;
  $57 = $8;
  $5 = $54;
  $6 = $55;
  $7 = $57;
  $58 = $6;
  $59 = $7;
  $4 = $59;
  $60 = $4;
  __ZN5BlockC2ERKS_($58,$60);
  $61 = $20;
  $62 = ((($61)) + 24|0);
  $20 = $62;
  $63 = $22;
  $64 = HEAP32[$63>>2]|0;
  $65 = ((($64)) + 24|0);
  HEAP32[$63>>2] = $65;
 }
 __ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEE24__RAII_IncreaseAnnotator6__doneEv($31);
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJNS_3valENSt3__26vectorI5BlockNS4_9allocatorIS6_EEEEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (872|0);
}
function __GLOBAL__sub_I_chunks_cpp() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___cxx_global_var_init();
 ___cxx_global_var_init_6();
 ___cxx_global_var_init_8();
 ___cxx_global_var_init_10();
 ___cxx_global_var_init_12();
 ___cxx_global_var_init_14();
 ___cxx_global_var_init_15();
 ___cxx_global_var_init_16();
 ___cxx_global_var_init_19();
 ___cxx_global_var_init_21();
 ___cxx_global_var_init_23();
 ___cxx_global_var_init_25();
 return;
}
function __GLOBAL__sub_I_bind_cpp() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___cxx_global_var_init_2();
 return;
}
function ___cxx_global_var_init_2() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN53EmscriptenBindingInitializer_native_and_builtin_typesC2Ev(7365);
 return;
}
function __ZN53EmscriptenBindingInitializer_native_and_builtin_typesC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIvE3getEv()|0);
 __embind_register_void(($2|0),(2157|0));
 $3 = (__ZN10emscripten8internal6TypeIDIbE3getEv()|0);
 __embind_register_bool(($3|0),(2162|0),1,1,0);
 __ZN12_GLOBAL__N_1L16register_integerIcEEvPKc(2167);
 __ZN12_GLOBAL__N_1L16register_integerIaEEvPKc(2172);
 __ZN12_GLOBAL__N_1L16register_integerIhEEvPKc(2184);
 __ZN12_GLOBAL__N_1L16register_integerIsEEvPKc(2198);
 __ZN12_GLOBAL__N_1L16register_integerItEEvPKc(2204);
 __ZN12_GLOBAL__N_1L16register_integerIiEEvPKc(2219);
 __ZN12_GLOBAL__N_1L16register_integerIjEEvPKc(2223);
 __ZN12_GLOBAL__N_1L16register_integerIlEEvPKc(2236);
 __ZN12_GLOBAL__N_1L16register_integerImEEvPKc(2241);
 __ZN12_GLOBAL__N_1L14register_floatIfEEvPKc(2255);
 __ZN12_GLOBAL__N_1L14register_floatIdEEvPKc(2261);
 $4 = (__ZN10emscripten8internal6TypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE3getEv()|0);
 __embind_register_std_string(($4|0),(2268|0));
 $5 = (__ZN10emscripten8internal6TypeIDINSt3__212basic_stringIhNS2_11char_traitsIhEENS2_9allocatorIhEEEEE3getEv()|0);
 __embind_register_std_string(($5|0),(2280|0));
 $6 = (__ZN10emscripten8internal6TypeIDINSt3__212basic_stringIwNS2_11char_traitsIwEENS2_9allocatorIwEEEEE3getEv()|0);
 __embind_register_std_wstring(($6|0),4,(2313|0));
 $7 = (__ZN10emscripten8internal6TypeIDINS_3valEE3getEv()|0);
 __embind_register_emval(($7|0),(2326|0));
 __ZN12_GLOBAL__N_1L20register_memory_viewIcEEvPKc(2342);
 __ZN12_GLOBAL__N_1L20register_memory_viewIaEEvPKc(2372);
 __ZN12_GLOBAL__N_1L20register_memory_viewIhEEvPKc(2409);
 __ZN12_GLOBAL__N_1L20register_memory_viewIsEEvPKc(2448);
 __ZN12_GLOBAL__N_1L20register_memory_viewItEEvPKc(2479);
 __ZN12_GLOBAL__N_1L20register_memory_viewIiEEvPKc(2519);
 __ZN12_GLOBAL__N_1L20register_memory_viewIjEEvPKc(2548);
 __ZN12_GLOBAL__N_1L20register_memory_viewIlEEvPKc(2586);
 __ZN12_GLOBAL__N_1L20register_memory_viewImEEvPKc(2616);
 __ZN12_GLOBAL__N_1L20register_memory_viewIaEEvPKc(2655);
 __ZN12_GLOBAL__N_1L20register_memory_viewIhEEvPKc(2687);
 __ZN12_GLOBAL__N_1L20register_memory_viewIsEEvPKc(2720);
 __ZN12_GLOBAL__N_1L20register_memory_viewItEEvPKc(2753);
 __ZN12_GLOBAL__N_1L20register_memory_viewIiEEvPKc(2787);
 __ZN12_GLOBAL__N_1L20register_memory_viewIjEEvPKc(2820);
 __ZN12_GLOBAL__N_1L20register_memory_viewIfEEvPKc(2854);
 __ZN12_GLOBAL__N_1L20register_memory_viewIdEEvPKc(2885);
 __ZN12_GLOBAL__N_1L20register_memory_viewIeEEvPKc(2917);
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal6TypeIDIvE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIvE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal6TypeIDIbE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIbE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_1L16register_integerIcEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIcE3getEv()|0);
 $3 = $1;
 $4 = -128 << 24 >> 24;
 $5 = 127 << 24 >> 24;
 __embind_register_integer(($2|0),($3|0),1,($4|0),($5|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L16register_integerIaEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIaE3getEv()|0);
 $3 = $1;
 $4 = -128 << 24 >> 24;
 $5 = 127 << 24 >> 24;
 __embind_register_integer(($2|0),($3|0),1,($4|0),($5|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L16register_integerIhEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIhE3getEv()|0);
 $3 = $1;
 $4 = 0;
 $5 = 255;
 __embind_register_integer(($2|0),($3|0),1,($4|0),($5|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L16register_integerIsEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIsE3getEv()|0);
 $3 = $1;
 $4 = -32768 << 16 >> 16;
 $5 = 32767 << 16 >> 16;
 __embind_register_integer(($2|0),($3|0),2,($4|0),($5|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L16register_integerItEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDItE3getEv()|0);
 $3 = $1;
 $4 = 0;
 $5 = 65535;
 __embind_register_integer(($2|0),($3|0),2,($4|0),($5|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L16register_integerIiEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIiE3getEv()|0);
 $3 = $1;
 __embind_register_integer(($2|0),($3|0),4,-2147483648,2147483647);
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L16register_integerIjEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIjE3getEv()|0);
 $3 = $1;
 __embind_register_integer(($2|0),($3|0),4,0,-1);
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L16register_integerIlEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIlE3getEv()|0);
 $3 = $1;
 __embind_register_integer(($2|0),($3|0),4,-2147483648,2147483647);
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L16register_integerImEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDImE3getEv()|0);
 $3 = $1;
 __embind_register_integer(($2|0),($3|0),4,0,-1);
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L14register_floatIfEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIfE3getEv()|0);
 $3 = $1;
 __embind_register_float(($2|0),($3|0),4);
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L14register_floatIdEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIdE3getEv()|0);
 $3 = $1;
 __embind_register_float(($2|0),($3|0),8);
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal6TypeIDINSt3__212basic_stringIhNS2_11char_traitsIhEENS2_9allocatorIhEEEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIhNS2_11char_traitsIhEENS2_9allocatorIhEEEEE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal6TypeIDINSt3__212basic_stringIwNS2_11char_traitsIwEENS2_9allocatorIwEEEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIwNS2_11char_traitsIwEENS2_9allocatorIwEEEEE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal6TypeIDINS_3valEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_3valEE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIcEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIcEEE3getEv()|0);
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIcEENS_15TypedArrayIndexEv()|0);
 $4 = $1;
 __embind_register_memory_view(($2|0),($3|0),($4|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIaEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIaEEE3getEv()|0);
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIaEENS_15TypedArrayIndexEv()|0);
 $4 = $1;
 __embind_register_memory_view(($2|0),($3|0),($4|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIhEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIhEEE3getEv()|0);
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIhEENS_15TypedArrayIndexEv()|0);
 $4 = $1;
 __embind_register_memory_view(($2|0),($3|0),($4|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIsEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIsEEE3getEv()|0);
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIsEENS_15TypedArrayIndexEv()|0);
 $4 = $1;
 __embind_register_memory_view(($2|0),($3|0),($4|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewItEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewItEEE3getEv()|0);
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexItEENS_15TypedArrayIndexEv()|0);
 $4 = $1;
 __embind_register_memory_view(($2|0),($3|0),($4|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIiEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIiEEE3getEv()|0);
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIiEENS_15TypedArrayIndexEv()|0);
 $4 = $1;
 __embind_register_memory_view(($2|0),($3|0),($4|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIjEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIjEEE3getEv()|0);
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIjEENS_15TypedArrayIndexEv()|0);
 $4 = $1;
 __embind_register_memory_view(($2|0),($3|0),($4|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIlEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIlEEE3getEv()|0);
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIlEENS_15TypedArrayIndexEv()|0);
 $4 = $1;
 __embind_register_memory_view(($2|0),($3|0),($4|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewImEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewImEEE3getEv()|0);
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexImEENS_15TypedArrayIndexEv()|0);
 $4 = $1;
 __embind_register_memory_view(($2|0),($3|0),($4|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIfEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIfEEE3getEv()|0);
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIfEENS_15TypedArrayIndexEv()|0);
 $4 = $1;
 __embind_register_memory_view(($2|0),($3|0),($4|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIdEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIdEEE3getEv()|0);
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIdEENS_15TypedArrayIndexEv()|0);
 $4 = $1;
 __embind_register_memory_view(($2|0),($3|0),($4|0));
 STACKTOP = sp;return;
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIeEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIeEEE3getEv()|0);
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIeEENS_15TypedArrayIndexEv()|0);
 $4 = $1;
 __embind_register_memory_view(($2|0),($3|0),($4|0));
 STACKTOP = sp;return;
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIeEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIeEEE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIeEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 7;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIeEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (152|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIdEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIdEEE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIdEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 7;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIdEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (160|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIfEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIfEEE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIfEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 6;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIfEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (168|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewImEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewImEEE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexImEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 5;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewImEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (176|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIlEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIlEEE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIlEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 4;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIlEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (184|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIjEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIjEEE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIjEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 5;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIjEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (192|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIiEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIiEEE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIiEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 4;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIiEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (200|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewItEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewItEEE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexItEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 3;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewItEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (208|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIsEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIsEEE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIsEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 2;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIsEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (216|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIhEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIhEEE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIhEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 1;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIhEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (224|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIaEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIaEEE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIaEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIaEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (232|0);
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIcEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIcEEE3getEv()|0);
 return ($0|0);
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIcEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIcEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (240|0);
}
function __ZN10emscripten8internal11LightTypeIDINS_3valEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (144|0);
}
function __ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIwNS2_11char_traitsIwEENS2_9allocatorIwEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (248|0);
}
function __ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIhNS2_11char_traitsIhEENS2_9allocatorIhEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (272|0);
}
function __ZN10emscripten8internal6TypeIDIdE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIdE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal11LightTypeIDIdE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (576|0);
}
function __ZN10emscripten8internal6TypeIDIfE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIfE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal11LightTypeIDIfE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (568|0);
}
function __ZN10emscripten8internal6TypeIDImE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDImE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal11LightTypeIDImE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (560|0);
}
function __ZN10emscripten8internal6TypeIDIlE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIlE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal11LightTypeIDIlE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (552|0);
}
function __ZN10emscripten8internal6TypeIDIjE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIjE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal11LightTypeIDIjE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (544|0);
}
function __ZN10emscripten8internal6TypeIDItE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDItE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal11LightTypeIDItE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (528|0);
}
function __ZN10emscripten8internal6TypeIDIsE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIsE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal11LightTypeIDIsE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (520|0);
}
function __ZN10emscripten8internal6TypeIDIhE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIhE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal11LightTypeIDIhE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (504|0);
}
function __ZN10emscripten8internal6TypeIDIaE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIaE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal11LightTypeIDIaE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (512|0);
}
function __ZN10emscripten8internal6TypeIDIcE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIcE3getEv()|0);
 return ($0|0);
}
function __ZN10emscripten8internal11LightTypeIDIcE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (496|0);
}
function __ZN10emscripten8internal11LightTypeIDIbE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (488|0);
}
function __ZN10emscripten8internal11LightTypeIDIvE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (472|0);
}
function ___getTypeName($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $2;
 $1 = $3;
 $4 = $1;
 $5 = ((($4)) + 4|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (___strdup($6)|0);
 STACKTOP = sp;return ($7|0);
}
function _emscripten_get_global_libc() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (6780|0);
}
function ___stdio_close($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $1 = ((($0)) + 60|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = (_dummy_450($2)|0);
 HEAP32[$vararg_buffer>>2] = $3;
 $4 = (___syscall6(6,($vararg_buffer|0))|0);
 $5 = (___syscall_ret($4)|0);
 STACKTOP = sp;return ($5|0);
}
function ___stdio_seek($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$pre = 0, $10 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr3 = 0, $vararg_ptr4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer = sp;
 $3 = sp + 20|0;
 $4 = ((($0)) + 60|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = $3;
 HEAP32[$vararg_buffer>>2] = $5;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = 0;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = $1;
 $vararg_ptr3 = ((($vararg_buffer)) + 12|0);
 HEAP32[$vararg_ptr3>>2] = $6;
 $vararg_ptr4 = ((($vararg_buffer)) + 16|0);
 HEAP32[$vararg_ptr4>>2] = $2;
 $7 = (___syscall140(140,($vararg_buffer|0))|0);
 $8 = (___syscall_ret($7)|0);
 $9 = ($8|0)<(0);
 if ($9) {
  HEAP32[$3>>2] = -1;
  $10 = -1;
 } else {
  $$pre = HEAP32[$3>>2]|0;
  $10 = $$pre;
 }
 STACKTOP = sp;return ($10|0);
}
function ___syscall_ret($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0>>>0)>(4294963200);
 if ($1) {
  $2 = (0 - ($0))|0;
  $3 = (___errno_location()|0);
  HEAP32[$3>>2] = $2;
  $$0 = -1;
 } else {
  $$0 = $0;
 }
 return ($$0|0);
}
function ___errno_location() {
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (___pthread_self_702()|0);
 $1 = ((($0)) + 64|0);
 return ($1|0);
}
function ___pthread_self_702() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (_pthread_self()|0);
 return ($0|0);
}
function _pthread_self() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (880|0);
}
function _dummy_450($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return ($0|0);
}
function ___stdout_write($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer = sp;
 $3 = sp + 16|0;
 $4 = ((($0)) + 36|0);
 HEAP32[$4>>2] = 4;
 $5 = HEAP32[$0>>2]|0;
 $6 = $5 & 64;
 $7 = ($6|0)==(0);
 if ($7) {
  $8 = ((($0)) + 60|0);
  $9 = HEAP32[$8>>2]|0;
  $10 = $3;
  HEAP32[$vararg_buffer>>2] = $9;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = 21523;
  $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
  HEAP32[$vararg_ptr2>>2] = $10;
  $11 = (___syscall54(54,($vararg_buffer|0))|0);
  $12 = ($11|0)==(0);
  if (!($12)) {
   $13 = ((($0)) + 75|0);
   HEAP8[$13>>0] = -1;
  }
 }
 $14 = (___stdio_write($0,$1,$2)|0);
 STACKTOP = sp;return ($14|0);
}
function ___stdio_write($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr6 = 0;
 var $vararg_ptr7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $3 = sp + 32|0;
 $4 = ((($0)) + 28|0);
 $5 = HEAP32[$4>>2]|0;
 HEAP32[$3>>2] = $5;
 $6 = ((($3)) + 4|0);
 $7 = ((($0)) + 20|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = (($8) - ($5))|0;
 HEAP32[$6>>2] = $9;
 $10 = ((($3)) + 8|0);
 HEAP32[$10>>2] = $1;
 $11 = ((($3)) + 12|0);
 HEAP32[$11>>2] = $2;
 $12 = (($9) + ($2))|0;
 $13 = ((($0)) + 60|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = $3;
 HEAP32[$vararg_buffer>>2] = $14;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = $15;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = 2;
 $16 = (___syscall146(146,($vararg_buffer|0))|0);
 $17 = (___syscall_ret($16)|0);
 $18 = ($12|0)==($17|0);
 L1: do {
  if ($18) {
   label = 3;
  } else {
   $$04756 = 2;$$04855 = $12;$$04954 = $3;$25 = $17;
   while(1) {
    $26 = ($25|0)<(0);
    if ($26) {
     break;
    }
    $34 = (($$04855) - ($25))|0;
    $35 = ((($$04954)) + 4|0);
    $36 = HEAP32[$35>>2]|0;
    $37 = ($25>>>0)>($36>>>0);
    $38 = ((($$04954)) + 8|0);
    $$150 = $37 ? $38 : $$04954;
    $39 = $37 << 31 >> 31;
    $$1 = (($39) + ($$04756))|0;
    $40 = $37 ? $36 : 0;
    $$0 = (($25) - ($40))|0;
    $41 = HEAP32[$$150>>2]|0;
    $42 = (($41) + ($$0)|0);
    HEAP32[$$150>>2] = $42;
    $43 = ((($$150)) + 4|0);
    $44 = HEAP32[$43>>2]|0;
    $45 = (($44) - ($$0))|0;
    HEAP32[$43>>2] = $45;
    $46 = HEAP32[$13>>2]|0;
    $47 = $$150;
    HEAP32[$vararg_buffer3>>2] = $46;
    $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
    HEAP32[$vararg_ptr6>>2] = $47;
    $vararg_ptr7 = ((($vararg_buffer3)) + 8|0);
    HEAP32[$vararg_ptr7>>2] = $$1;
    $48 = (___syscall146(146,($vararg_buffer3|0))|0);
    $49 = (___syscall_ret($48)|0);
    $50 = ($34|0)==($49|0);
    if ($50) {
     label = 3;
     break L1;
    } else {
     $$04756 = $$1;$$04855 = $34;$$04954 = $$150;$25 = $49;
    }
   }
   $27 = ((($0)) + 16|0);
   HEAP32[$27>>2] = 0;
   HEAP32[$4>>2] = 0;
   HEAP32[$7>>2] = 0;
   $28 = HEAP32[$0>>2]|0;
   $29 = $28 | 32;
   HEAP32[$0>>2] = $29;
   $30 = ($$04756|0)==(2);
   if ($30) {
    $$051 = 0;
   } else {
    $31 = ((($$04954)) + 4|0);
    $32 = HEAP32[$31>>2]|0;
    $33 = (($2) - ($32))|0;
    $$051 = $33;
   }
  }
 } while(0);
 if ((label|0) == 3) {
  $19 = ((($0)) + 44|0);
  $20 = HEAP32[$19>>2]|0;
  $21 = ((($0)) + 48|0);
  $22 = HEAP32[$21>>2]|0;
  $23 = (($20) + ($22)|0);
  $24 = ((($0)) + 16|0);
  HEAP32[$24>>2] = $23;
  HEAP32[$4>>2] = $20;
  HEAP32[$7>>2] = $20;
  $$051 = $2;
 }
 STACKTOP = sp;return ($$051|0);
}
function _strcmp($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $2 = HEAP8[$0>>0]|0;
 $3 = HEAP8[$1>>0]|0;
 $4 = ($2<<24>>24)!=($3<<24>>24);
 $5 = ($2<<24>>24)==(0);
 $or$cond9 = $5 | $4;
 if ($or$cond9) {
  $$lcssa = $3;$$lcssa8 = $2;
 } else {
  $$011 = $1;$$0710 = $0;
  while(1) {
   $6 = ((($$0710)) + 1|0);
   $7 = ((($$011)) + 1|0);
   $8 = HEAP8[$6>>0]|0;
   $9 = HEAP8[$7>>0]|0;
   $10 = ($8<<24>>24)!=($9<<24>>24);
   $11 = ($8<<24>>24)==(0);
   $or$cond = $11 | $10;
   if ($or$cond) {
    $$lcssa = $9;$$lcssa8 = $8;
    break;
   } else {
    $$011 = $7;$$0710 = $6;
   }
  }
 }
 $12 = $$lcssa8&255;
 $13 = $$lcssa&255;
 $14 = (($12) - ($13))|0;
 return ($14|0);
}
function ___mo_lookup($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$ = 0, $$090 = 0, $$094 = 0, $$191 = 0, $$195 = 0, $$4 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0;
 var $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0;
 var $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond102 = 0, $or$cond104 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = HEAP32[$0>>2]|0;
 $4 = (($3) + 1794895138)|0;
 $5 = ((($0)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (_swapc($6,$4)|0);
 $8 = ((($0)) + 12|0);
 $9 = HEAP32[$8>>2]|0;
 $10 = (_swapc($9,$4)|0);
 $11 = ((($0)) + 16|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = (_swapc($12,$4)|0);
 $14 = $1 >>> 2;
 $15 = ($7>>>0)<($14>>>0);
 L1: do {
  if ($15) {
   $16 = $7 << 2;
   $17 = (($1) - ($16))|0;
   $18 = ($10>>>0)<($17>>>0);
   $19 = ($13>>>0)<($17>>>0);
   $or$cond = $18 & $19;
   if ($or$cond) {
    $20 = $13 | $10;
    $21 = $20 & 3;
    $22 = ($21|0)==(0);
    if ($22) {
     $23 = $10 >>> 2;
     $24 = $13 >>> 2;
     $$090 = 0;$$094 = $7;
     while(1) {
      $25 = $$094 >>> 1;
      $26 = (($$090) + ($25))|0;
      $27 = $26 << 1;
      $28 = (($27) + ($23))|0;
      $29 = (($0) + ($28<<2)|0);
      $30 = HEAP32[$29>>2]|0;
      $31 = (_swapc($30,$4)|0);
      $32 = (($28) + 1)|0;
      $33 = (($0) + ($32<<2)|0);
      $34 = HEAP32[$33>>2]|0;
      $35 = (_swapc($34,$4)|0);
      $36 = ($35>>>0)<($1>>>0);
      $37 = (($1) - ($35))|0;
      $38 = ($31>>>0)<($37>>>0);
      $or$cond102 = $36 & $38;
      if (!($or$cond102)) {
       $$4 = 0;
       break L1;
      }
      $39 = (($35) + ($31))|0;
      $40 = (($0) + ($39)|0);
      $41 = HEAP8[$40>>0]|0;
      $42 = ($41<<24>>24)==(0);
      if (!($42)) {
       $$4 = 0;
       break L1;
      }
      $43 = (($0) + ($35)|0);
      $44 = (_strcmp($2,$43)|0);
      $45 = ($44|0)==(0);
      if ($45) {
       break;
      }
      $62 = ($$094|0)==(1);
      $63 = ($44|0)<(0);
      $64 = (($$094) - ($25))|0;
      $$195 = $63 ? $25 : $64;
      $$191 = $63 ? $$090 : $26;
      if ($62) {
       $$4 = 0;
       break L1;
      } else {
       $$090 = $$191;$$094 = $$195;
      }
     }
     $46 = (($27) + ($24))|0;
     $47 = (($0) + ($46<<2)|0);
     $48 = HEAP32[$47>>2]|0;
     $49 = (_swapc($48,$4)|0);
     $50 = (($46) + 1)|0;
     $51 = (($0) + ($50<<2)|0);
     $52 = HEAP32[$51>>2]|0;
     $53 = (_swapc($52,$4)|0);
     $54 = ($53>>>0)<($1>>>0);
     $55 = (($1) - ($53))|0;
     $56 = ($49>>>0)<($55>>>0);
     $or$cond104 = $54 & $56;
     if ($or$cond104) {
      $57 = (($0) + ($53)|0);
      $58 = (($53) + ($49))|0;
      $59 = (($0) + ($58)|0);
      $60 = HEAP8[$59>>0]|0;
      $61 = ($60<<24>>24)==(0);
      $$ = $61 ? $57 : 0;
      $$4 = $$;
     } else {
      $$4 = 0;
     }
    } else {
     $$4 = 0;
    }
   } else {
    $$4 = 0;
   }
  } else {
   $$4 = 0;
  }
 } while(0);
 return ($$4|0);
}
function _swapc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$ = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1|0)==(0);
 $3 = (_llvm_bswap_i32(($0|0))|0);
 $$ = $2 ? $0 : $3;
 return ($$|0);
}
function ___lctrans_impl($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1|0)==(0|0);
 if ($2) {
  $$0 = 0;
 } else {
  $3 = HEAP32[$1>>2]|0;
  $4 = ((($1)) + 4|0);
  $5 = HEAP32[$4>>2]|0;
  $6 = (___mo_lookup($3,$5,$0)|0);
  $$0 = $6;
 }
 $7 = ($$0|0)!=(0|0);
 $8 = $7 ? $$0 : $0;
 return ($8|0);
}
function _strlen($0) {
 $0 = $0|0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$pre = 0, $$sink = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = $0;
 $2 = $1 & 3;
 $3 = ($2|0)==(0);
 L1: do {
  if ($3) {
   $$015$lcssa = $0;
   label = 4;
  } else {
   $$01519 = $0;$23 = $1;
   while(1) {
    $4 = HEAP8[$$01519>>0]|0;
    $5 = ($4<<24>>24)==(0);
    if ($5) {
     $$sink = $23;
     break L1;
    }
    $6 = ((($$01519)) + 1|0);
    $7 = $6;
    $8 = $7 & 3;
    $9 = ($8|0)==(0);
    if ($9) {
     $$015$lcssa = $6;
     label = 4;
     break;
    } else {
     $$01519 = $6;$23 = $7;
    }
   }
  }
 } while(0);
 if ((label|0) == 4) {
  $$0 = $$015$lcssa;
  while(1) {
   $10 = HEAP32[$$0>>2]|0;
   $11 = (($10) + -16843009)|0;
   $12 = $10 & -2139062144;
   $13 = $12 ^ -2139062144;
   $14 = $13 & $11;
   $15 = ($14|0)==(0);
   $16 = ((($$0)) + 4|0);
   if ($15) {
    $$0 = $16;
   } else {
    break;
   }
  }
  $17 = $10&255;
  $18 = ($17<<24>>24)==(0);
  if ($18) {
   $$1$lcssa = $$0;
  } else {
   $$pn = $$0;
   while(1) {
    $19 = ((($$pn)) + 1|0);
    $$pre = HEAP8[$19>>0]|0;
    $20 = ($$pre<<24>>24)==(0);
    if ($20) {
     $$1$lcssa = $19;
     break;
    } else {
     $$pn = $19;
    }
   }
  }
  $21 = $$1$lcssa;
  $$sink = $21;
 }
 $22 = (($$sink) - ($1))|0;
 return ($22|0);
}
function _vfprintf($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$ = 0, $$0 = 0, $$1 = 0, $$1$ = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $vacopy_currentptr = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 224|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(224|0);
 $3 = sp + 120|0;
 $4 = sp + 80|0;
 $5 = sp;
 $6 = sp + 136|0;
 dest=$4; stop=dest+40|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 $vacopy_currentptr = HEAP32[$2>>2]|0;
 HEAP32[$3>>2] = $vacopy_currentptr;
 $7 = (_printf_core(0,$1,$3,$5,$4)|0);
 $8 = ($7|0)<(0);
 if ($8) {
  $$0 = -1;
 } else {
  $9 = ((($0)) + 76|0);
  $10 = HEAP32[$9>>2]|0;
  $11 = ($10|0)>(-1);
  if ($11) {
   $12 = (___lockfile($0)|0);
   $39 = $12;
  } else {
   $39 = 0;
  }
  $13 = HEAP32[$0>>2]|0;
  $14 = $13 & 32;
  $15 = ((($0)) + 74|0);
  $16 = HEAP8[$15>>0]|0;
  $17 = ($16<<24>>24)<(1);
  if ($17) {
   $18 = $13 & -33;
   HEAP32[$0>>2] = $18;
  }
  $19 = ((($0)) + 48|0);
  $20 = HEAP32[$19>>2]|0;
  $21 = ($20|0)==(0);
  if ($21) {
   $23 = ((($0)) + 44|0);
   $24 = HEAP32[$23>>2]|0;
   HEAP32[$23>>2] = $6;
   $25 = ((($0)) + 28|0);
   HEAP32[$25>>2] = $6;
   $26 = ((($0)) + 20|0);
   HEAP32[$26>>2] = $6;
   HEAP32[$19>>2] = 80;
   $27 = ((($6)) + 80|0);
   $28 = ((($0)) + 16|0);
   HEAP32[$28>>2] = $27;
   $29 = (_printf_core($0,$1,$3,$5,$4)|0);
   $30 = ($24|0)==(0|0);
   if ($30) {
    $$1 = $29;
   } else {
    $31 = ((($0)) + 36|0);
    $32 = HEAP32[$31>>2]|0;
    (FUNCTION_TABLE_iiii[$32 & 127]($0,0,0)|0);
    $33 = HEAP32[$26>>2]|0;
    $34 = ($33|0)==(0|0);
    $$ = $34 ? -1 : $29;
    HEAP32[$23>>2] = $24;
    HEAP32[$19>>2] = 0;
    HEAP32[$28>>2] = 0;
    HEAP32[$25>>2] = 0;
    HEAP32[$26>>2] = 0;
    $$1 = $$;
   }
  } else {
   $22 = (_printf_core($0,$1,$3,$5,$4)|0);
   $$1 = $22;
  }
  $35 = HEAP32[$0>>2]|0;
  $36 = $35 & 32;
  $37 = ($36|0)==(0);
  $$1$ = $37 ? $$1 : -1;
  $38 = $35 | $14;
  HEAP32[$0>>2] = $38;
  $40 = ($39|0)==(0);
  if (!($40)) {
   ___unlockfile($0);
  }
  $$0 = $$1$;
 }
 STACKTOP = sp;return ($$0|0);
}
function _printf_core($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$ = 0, $$$ = 0, $$$0259 = 0, $$$0262 = 0, $$$0269 = 0, $$$4266 = 0, $$$5 = 0, $$0 = 0, $$0228 = 0, $$0228$ = 0, $$0229322 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa357 = 0, $$0240321 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0;
 var $$0249306 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0254$$0254$ = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262311 = 0, $$0269 = 0, $$0269$phi = 0, $$1 = 0, $$1230333 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241332 = 0, $$1244320 = 0, $$1248 = 0, $$1250 = 0, $$1255 = 0;
 var $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242305 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2256$ = 0, $$2256$$$2256 = 0, $$2261 = 0, $$2271 = 0, $$284$ = 0, $$289 = 0, $$290 = 0, $$3257 = 0, $$3265 = 0;
 var $$3272 = 0, $$3303 = 0, $$377 = 0, $$4258355 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa295 = 0, $$pre = 0, $$pre346 = 0, $$pre347 = 0, $$pre347$pre = 0, $$pre349 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0;
 var $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0;
 var $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0;
 var $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0;
 var $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0;
 var $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0;
 var $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0;
 var $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0;
 var $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0;
 var $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0;
 var $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0;
 var $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0;
 var $306 = 0.0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0;
 var $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0;
 var $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0;
 var $arglist_current = 0, $arglist_current2 = 0, $arglist_next = 0, $arglist_next3 = 0, $expanded = 0, $expanded10 = 0, $expanded11 = 0, $expanded13 = 0, $expanded14 = 0, $expanded15 = 0, $expanded4 = 0, $expanded6 = 0, $expanded7 = 0, $expanded8 = 0, $isdigit = 0, $isdigit275 = 0, $isdigit277 = 0, $isdigittmp = 0, $isdigittmp$ = 0, $isdigittmp274 = 0;
 var $isdigittmp276 = 0, $narrow = 0, $or$cond = 0, $or$cond281 = 0, $or$cond283 = 0, $or$cond286 = 0, $storemerge = 0, $storemerge273310 = 0, $storemerge278 = 0, $trunc = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $5 = sp + 16|0;
 $6 = sp;
 $7 = sp + 24|0;
 $8 = sp + 8|0;
 $9 = sp + 20|0;
 HEAP32[$5>>2] = $1;
 $10 = ($0|0)!=(0|0);
 $11 = ((($7)) + 40|0);
 $12 = $11;
 $13 = ((($7)) + 39|0);
 $14 = ((($8)) + 4|0);
 $$0243 = 0;$$0247 = 0;$$0269 = 0;$21 = $1;
 L1: while(1) {
  $15 = ($$0247|0)>(-1);
  do {
   if ($15) {
    $16 = (2147483647 - ($$0247))|0;
    $17 = ($$0243|0)>($16|0);
    if ($17) {
     $18 = (___errno_location()|0);
     HEAP32[$18>>2] = 75;
     $$1248 = -1;
     break;
    } else {
     $19 = (($$0243) + ($$0247))|0;
     $$1248 = $19;
     break;
    }
   } else {
    $$1248 = $$0247;
   }
  } while(0);
  $20 = HEAP8[$21>>0]|0;
  $22 = ($20<<24>>24)==(0);
  if ($22) {
   label = 87;
   break;
  } else {
   $23 = $20;$25 = $21;
  }
  L9: while(1) {
   switch ($23<<24>>24) {
   case 37:  {
    $$0249306 = $25;$27 = $25;
    label = 9;
    break L9;
    break;
   }
   case 0:  {
    $$0249$lcssa = $25;$39 = $25;
    break L9;
    break;
   }
   default: {
   }
   }
   $24 = ((($25)) + 1|0);
   HEAP32[$5>>2] = $24;
   $$pre = HEAP8[$24>>0]|0;
   $23 = $$pre;$25 = $24;
  }
  L12: do {
   if ((label|0) == 9) {
    while(1) {
     label = 0;
     $26 = ((($27)) + 1|0);
     $28 = HEAP8[$26>>0]|0;
     $29 = ($28<<24>>24)==(37);
     if (!($29)) {
      $$0249$lcssa = $$0249306;$39 = $27;
      break L12;
     }
     $30 = ((($$0249306)) + 1|0);
     $31 = ((($27)) + 2|0);
     HEAP32[$5>>2] = $31;
     $32 = HEAP8[$31>>0]|0;
     $33 = ($32<<24>>24)==(37);
     if ($33) {
      $$0249306 = $30;$27 = $31;
      label = 9;
     } else {
      $$0249$lcssa = $30;$39 = $31;
      break;
     }
    }
   }
  } while(0);
  $34 = $$0249$lcssa;
  $35 = $21;
  $36 = (($34) - ($35))|0;
  if ($10) {
   _out_500($0,$21,$36);
  }
  $37 = ($36|0)==(0);
  if (!($37)) {
   $$0269$phi = $$0269;$$0243 = $36;$$0247 = $$1248;$21 = $39;$$0269 = $$0269$phi;
   continue;
  }
  $38 = ((($39)) + 1|0);
  $40 = HEAP8[$38>>0]|0;
  $41 = $40 << 24 >> 24;
  $isdigittmp = (($41) + -48)|0;
  $isdigit = ($isdigittmp>>>0)<(10);
  if ($isdigit) {
   $42 = ((($39)) + 2|0);
   $43 = HEAP8[$42>>0]|0;
   $44 = ($43<<24>>24)==(36);
   $45 = ((($39)) + 3|0);
   $$377 = $44 ? $45 : $38;
   $$$0269 = $44 ? 1 : $$0269;
   $isdigittmp$ = $44 ? $isdigittmp : -1;
   $$0253 = $isdigittmp$;$$1270 = $$$0269;$storemerge = $$377;
  } else {
   $$0253 = -1;$$1270 = $$0269;$storemerge = $38;
  }
  HEAP32[$5>>2] = $storemerge;
  $46 = HEAP8[$storemerge>>0]|0;
  $47 = $46 << 24 >> 24;
  $48 = (($47) + -32)|0;
  $49 = ($48>>>0)<(32);
  L24: do {
   if ($49) {
    $$0262311 = 0;$329 = $46;$51 = $48;$storemerge273310 = $storemerge;
    while(1) {
     $50 = 1 << $51;
     $52 = $50 & 75913;
     $53 = ($52|0)==(0);
     if ($53) {
      $$0262$lcssa = $$0262311;$$lcssa295 = $329;$62 = $storemerge273310;
      break L24;
     }
     $54 = $50 | $$0262311;
     $55 = ((($storemerge273310)) + 1|0);
     HEAP32[$5>>2] = $55;
     $56 = HEAP8[$55>>0]|0;
     $57 = $56 << 24 >> 24;
     $58 = (($57) + -32)|0;
     $59 = ($58>>>0)<(32);
     if ($59) {
      $$0262311 = $54;$329 = $56;$51 = $58;$storemerge273310 = $55;
     } else {
      $$0262$lcssa = $54;$$lcssa295 = $56;$62 = $55;
      break;
     }
    }
   } else {
    $$0262$lcssa = 0;$$lcssa295 = $46;$62 = $storemerge;
   }
  } while(0);
  $60 = ($$lcssa295<<24>>24)==(42);
  if ($60) {
   $61 = ((($62)) + 1|0);
   $63 = HEAP8[$61>>0]|0;
   $64 = $63 << 24 >> 24;
   $isdigittmp276 = (($64) + -48)|0;
   $isdigit277 = ($isdigittmp276>>>0)<(10);
   if ($isdigit277) {
    $65 = ((($62)) + 2|0);
    $66 = HEAP8[$65>>0]|0;
    $67 = ($66<<24>>24)==(36);
    if ($67) {
     $68 = (($4) + ($isdigittmp276<<2)|0);
     HEAP32[$68>>2] = 10;
     $69 = HEAP8[$61>>0]|0;
     $70 = $69 << 24 >> 24;
     $71 = (($70) + -48)|0;
     $72 = (($3) + ($71<<3)|0);
     $73 = $72;
     $74 = $73;
     $75 = HEAP32[$74>>2]|0;
     $76 = (($73) + 4)|0;
     $77 = $76;
     $78 = HEAP32[$77>>2]|0;
     $79 = ((($62)) + 3|0);
     $$0259 = $75;$$2271 = 1;$storemerge278 = $79;
    } else {
     label = 23;
    }
   } else {
    label = 23;
   }
   if ((label|0) == 23) {
    label = 0;
    $80 = ($$1270|0)==(0);
    if (!($80)) {
     $$0 = -1;
     break;
    }
    if ($10) {
     $arglist_current = HEAP32[$2>>2]|0;
     $81 = $arglist_current;
     $82 = ((0) + 4|0);
     $expanded4 = $82;
     $expanded = (($expanded4) - 1)|0;
     $83 = (($81) + ($expanded))|0;
     $84 = ((0) + 4|0);
     $expanded8 = $84;
     $expanded7 = (($expanded8) - 1)|0;
     $expanded6 = $expanded7 ^ -1;
     $85 = $83 & $expanded6;
     $86 = $85;
     $87 = HEAP32[$86>>2]|0;
     $arglist_next = ((($86)) + 4|0);
     HEAP32[$2>>2] = $arglist_next;
     $$0259 = $87;$$2271 = 0;$storemerge278 = $61;
    } else {
     $$0259 = 0;$$2271 = 0;$storemerge278 = $61;
    }
   }
   HEAP32[$5>>2] = $storemerge278;
   $88 = ($$0259|0)<(0);
   $89 = $$0262$lcssa | 8192;
   $90 = (0 - ($$0259))|0;
   $$$0262 = $88 ? $89 : $$0262$lcssa;
   $$$0259 = $88 ? $90 : $$0259;
   $$1260 = $$$0259;$$1263 = $$$0262;$$3272 = $$2271;$94 = $storemerge278;
  } else {
   $91 = (_getint_501($5)|0);
   $92 = ($91|0)<(0);
   if ($92) {
    $$0 = -1;
    break;
   }
   $$pre346 = HEAP32[$5>>2]|0;
   $$1260 = $91;$$1263 = $$0262$lcssa;$$3272 = $$1270;$94 = $$pre346;
  }
  $93 = HEAP8[$94>>0]|0;
  $95 = ($93<<24>>24)==(46);
  do {
   if ($95) {
    $96 = ((($94)) + 1|0);
    $97 = HEAP8[$96>>0]|0;
    $98 = ($97<<24>>24)==(42);
    if (!($98)) {
     $125 = ((($94)) + 1|0);
     HEAP32[$5>>2] = $125;
     $126 = (_getint_501($5)|0);
     $$pre347$pre = HEAP32[$5>>2]|0;
     $$0254 = $126;$$pre347 = $$pre347$pre;
     break;
    }
    $99 = ((($94)) + 2|0);
    $100 = HEAP8[$99>>0]|0;
    $101 = $100 << 24 >> 24;
    $isdigittmp274 = (($101) + -48)|0;
    $isdigit275 = ($isdigittmp274>>>0)<(10);
    if ($isdigit275) {
     $102 = ((($94)) + 3|0);
     $103 = HEAP8[$102>>0]|0;
     $104 = ($103<<24>>24)==(36);
     if ($104) {
      $105 = (($4) + ($isdigittmp274<<2)|0);
      HEAP32[$105>>2] = 10;
      $106 = HEAP8[$99>>0]|0;
      $107 = $106 << 24 >> 24;
      $108 = (($107) + -48)|0;
      $109 = (($3) + ($108<<3)|0);
      $110 = $109;
      $111 = $110;
      $112 = HEAP32[$111>>2]|0;
      $113 = (($110) + 4)|0;
      $114 = $113;
      $115 = HEAP32[$114>>2]|0;
      $116 = ((($94)) + 4|0);
      HEAP32[$5>>2] = $116;
      $$0254 = $112;$$pre347 = $116;
      break;
     }
    }
    $117 = ($$3272|0)==(0);
    if (!($117)) {
     $$0 = -1;
     break L1;
    }
    if ($10) {
     $arglist_current2 = HEAP32[$2>>2]|0;
     $118 = $arglist_current2;
     $119 = ((0) + 4|0);
     $expanded11 = $119;
     $expanded10 = (($expanded11) - 1)|0;
     $120 = (($118) + ($expanded10))|0;
     $121 = ((0) + 4|0);
     $expanded15 = $121;
     $expanded14 = (($expanded15) - 1)|0;
     $expanded13 = $expanded14 ^ -1;
     $122 = $120 & $expanded13;
     $123 = $122;
     $124 = HEAP32[$123>>2]|0;
     $arglist_next3 = ((($123)) + 4|0);
     HEAP32[$2>>2] = $arglist_next3;
     $330 = $124;
    } else {
     $330 = 0;
    }
    HEAP32[$5>>2] = $99;
    $$0254 = $330;$$pre347 = $99;
   } else {
    $$0254 = -1;$$pre347 = $94;
   }
  } while(0);
  $$0252 = 0;$128 = $$pre347;
  while(1) {
   $127 = HEAP8[$128>>0]|0;
   $129 = $127 << 24 >> 24;
   $130 = (($129) + -65)|0;
   $131 = ($130>>>0)>(57);
   if ($131) {
    $$0 = -1;
    break L1;
   }
   $132 = ((($128)) + 1|0);
   HEAP32[$5>>2] = $132;
   $133 = HEAP8[$128>>0]|0;
   $134 = $133 << 24 >> 24;
   $135 = (($134) + -65)|0;
   $136 = ((3452 + (($$0252*58)|0)|0) + ($135)|0);
   $137 = HEAP8[$136>>0]|0;
   $138 = $137&255;
   $139 = (($138) + -1)|0;
   $140 = ($139>>>0)<(8);
   if ($140) {
    $$0252 = $138;$128 = $132;
   } else {
    break;
   }
  }
  $141 = ($137<<24>>24)==(0);
  if ($141) {
   $$0 = -1;
   break;
  }
  $142 = ($137<<24>>24)==(19);
  $143 = ($$0253|0)>(-1);
  do {
   if ($142) {
    if ($143) {
     $$0 = -1;
     break L1;
    } else {
     label = 49;
    }
   } else {
    if ($143) {
     $144 = (($4) + ($$0253<<2)|0);
     HEAP32[$144>>2] = $138;
     $145 = (($3) + ($$0253<<3)|0);
     $146 = $145;
     $147 = $146;
     $148 = HEAP32[$147>>2]|0;
     $149 = (($146) + 4)|0;
     $150 = $149;
     $151 = HEAP32[$150>>2]|0;
     $152 = $6;
     $153 = $152;
     HEAP32[$153>>2] = $148;
     $154 = (($152) + 4)|0;
     $155 = $154;
     HEAP32[$155>>2] = $151;
     label = 49;
     break;
    }
    if (!($10)) {
     $$0 = 0;
     break L1;
    }
    _pop_arg_503($6,$138,$2);
   }
  } while(0);
  if ((label|0) == 49) {
   label = 0;
   if (!($10)) {
    $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
    continue;
   }
  }
  $156 = HEAP8[$128>>0]|0;
  $157 = $156 << 24 >> 24;
  $158 = ($$0252|0)!=(0);
  $159 = $157 & 15;
  $160 = ($159|0)==(3);
  $or$cond281 = $158 & $160;
  $161 = $157 & -33;
  $$0235 = $or$cond281 ? $161 : $157;
  $162 = $$1263 & 8192;
  $163 = ($162|0)==(0);
  $164 = $$1263 & -65537;
  $$1263$ = $163 ? $$1263 : $164;
  L71: do {
   switch ($$0235|0) {
   case 110:  {
    $trunc = $$0252&255;
    switch ($trunc<<24>>24) {
    case 0:  {
     $171 = HEAP32[$6>>2]|0;
     HEAP32[$171>>2] = $$1248;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 1:  {
     $172 = HEAP32[$6>>2]|0;
     HEAP32[$172>>2] = $$1248;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 2:  {
     $173 = ($$1248|0)<(0);
     $174 = $173 << 31 >> 31;
     $175 = HEAP32[$6>>2]|0;
     $176 = $175;
     $177 = $176;
     HEAP32[$177>>2] = $$1248;
     $178 = (($176) + 4)|0;
     $179 = $178;
     HEAP32[$179>>2] = $174;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 3:  {
     $180 = $$1248&65535;
     $181 = HEAP32[$6>>2]|0;
     HEAP16[$181>>1] = $180;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 4:  {
     $182 = $$1248&255;
     $183 = HEAP32[$6>>2]|0;
     HEAP8[$183>>0] = $182;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 6:  {
     $184 = HEAP32[$6>>2]|0;
     HEAP32[$184>>2] = $$1248;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    case 7:  {
     $185 = ($$1248|0)<(0);
     $186 = $185 << 31 >> 31;
     $187 = HEAP32[$6>>2]|0;
     $188 = $187;
     $189 = $188;
     HEAP32[$189>>2] = $$1248;
     $190 = (($188) + 4)|0;
     $191 = $190;
     HEAP32[$191>>2] = $186;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
     break;
    }
    default: {
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
     continue L1;
    }
    }
    break;
   }
   case 112:  {
    $192 = ($$0254>>>0)>(8);
    $193 = $192 ? $$0254 : 8;
    $194 = $$1263$ | 8;
    $$1236 = 120;$$1255 = $193;$$3265 = $194;
    label = 61;
    break;
   }
   case 88: case 120:  {
    $$1236 = $$0235;$$1255 = $$0254;$$3265 = $$1263$;
    label = 61;
    break;
   }
   case 111:  {
    $210 = $6;
    $211 = $210;
    $212 = HEAP32[$211>>2]|0;
    $213 = (($210) + 4)|0;
    $214 = $213;
    $215 = HEAP32[$214>>2]|0;
    $216 = (_fmt_o($212,$215,$11)|0);
    $217 = $$1263$ & 8;
    $218 = ($217|0)==(0);
    $219 = $216;
    $220 = (($12) - ($219))|0;
    $221 = ($$0254|0)>($220|0);
    $222 = (($220) + 1)|0;
    $223 = $218 | $221;
    $$0254$$0254$ = $223 ? $$0254 : $222;
    $$0228 = $216;$$1233 = 0;$$1238 = 3916;$$2256 = $$0254$$0254$;$$4266 = $$1263$;$247 = $212;$249 = $215;
    label = 67;
    break;
   }
   case 105: case 100:  {
    $224 = $6;
    $225 = $224;
    $226 = HEAP32[$225>>2]|0;
    $227 = (($224) + 4)|0;
    $228 = $227;
    $229 = HEAP32[$228>>2]|0;
    $230 = ($229|0)<(0);
    if ($230) {
     $231 = (_i64Subtract(0,0,($226|0),($229|0))|0);
     $232 = tempRet0;
     $233 = $6;
     $234 = $233;
     HEAP32[$234>>2] = $231;
     $235 = (($233) + 4)|0;
     $236 = $235;
     HEAP32[$236>>2] = $232;
     $$0232 = 1;$$0237 = 3916;$242 = $231;$243 = $232;
     label = 66;
     break L71;
    } else {
     $237 = $$1263$ & 2048;
     $238 = ($237|0)==(0);
     $239 = $$1263$ & 1;
     $240 = ($239|0)==(0);
     $$ = $240 ? 3916 : (3918);
     $$$ = $238 ? $$ : (3917);
     $241 = $$1263$ & 2049;
     $narrow = ($241|0)!=(0);
     $$284$ = $narrow&1;
     $$0232 = $$284$;$$0237 = $$$;$242 = $226;$243 = $229;
     label = 66;
     break L71;
    }
    break;
   }
   case 117:  {
    $165 = $6;
    $166 = $165;
    $167 = HEAP32[$166>>2]|0;
    $168 = (($165) + 4)|0;
    $169 = $168;
    $170 = HEAP32[$169>>2]|0;
    $$0232 = 0;$$0237 = 3916;$242 = $167;$243 = $170;
    label = 66;
    break;
   }
   case 99:  {
    $259 = $6;
    $260 = $259;
    $261 = HEAP32[$260>>2]|0;
    $262 = (($259) + 4)|0;
    $263 = $262;
    $264 = HEAP32[$263>>2]|0;
    $265 = $261&255;
    HEAP8[$13>>0] = $265;
    $$2 = $13;$$2234 = 0;$$2239 = 3916;$$2251 = $11;$$5 = 1;$$6268 = $164;
    break;
   }
   case 109:  {
    $266 = (___errno_location()|0);
    $267 = HEAP32[$266>>2]|0;
    $268 = (_strerror($267)|0);
    $$1 = $268;
    label = 71;
    break;
   }
   case 115:  {
    $269 = HEAP32[$6>>2]|0;
    $270 = ($269|0)!=(0|0);
    $271 = $270 ? $269 : 3926;
    $$1 = $271;
    label = 71;
    break;
   }
   case 67:  {
    $278 = $6;
    $279 = $278;
    $280 = HEAP32[$279>>2]|0;
    $281 = (($278) + 4)|0;
    $282 = $281;
    $283 = HEAP32[$282>>2]|0;
    HEAP32[$8>>2] = $280;
    HEAP32[$14>>2] = 0;
    HEAP32[$6>>2] = $8;
    $$4258355 = -1;$331 = $8;
    label = 75;
    break;
   }
   case 83:  {
    $$pre349 = HEAP32[$6>>2]|0;
    $284 = ($$0254|0)==(0);
    if ($284) {
     _pad_506($0,32,$$1260,0,$$1263$);
     $$0240$lcssa357 = 0;
     label = 84;
    } else {
     $$4258355 = $$0254;$331 = $$pre349;
     label = 75;
    }
    break;
   }
   case 65: case 71: case 70: case 69: case 97: case 103: case 102: case 101:  {
    $306 = +HEAPF64[$6>>3];
    $307 = (_fmt_fp($0,$306,$$1260,$$0254,$$1263$,$$0235)|0);
    $$0243 = $307;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
    continue L1;
    break;
   }
   default: {
    $$2 = $21;$$2234 = 0;$$2239 = 3916;$$2251 = $11;$$5 = $$0254;$$6268 = $$1263$;
   }
   }
  } while(0);
  L95: do {
   if ((label|0) == 61) {
    label = 0;
    $195 = $6;
    $196 = $195;
    $197 = HEAP32[$196>>2]|0;
    $198 = (($195) + 4)|0;
    $199 = $198;
    $200 = HEAP32[$199>>2]|0;
    $201 = $$1236 & 32;
    $202 = (_fmt_x($197,$200,$11,$201)|0);
    $203 = ($197|0)==(0);
    $204 = ($200|0)==(0);
    $205 = $203 & $204;
    $206 = $$3265 & 8;
    $207 = ($206|0)==(0);
    $or$cond283 = $207 | $205;
    $208 = $$1236 >> 4;
    $209 = (3916 + ($208)|0);
    $$289 = $or$cond283 ? 3916 : $209;
    $$290 = $or$cond283 ? 0 : 2;
    $$0228 = $202;$$1233 = $$290;$$1238 = $$289;$$2256 = $$1255;$$4266 = $$3265;$247 = $197;$249 = $200;
    label = 67;
   }
   else if ((label|0) == 66) {
    label = 0;
    $244 = (_fmt_u($242,$243,$11)|0);
    $$0228 = $244;$$1233 = $$0232;$$1238 = $$0237;$$2256 = $$0254;$$4266 = $$1263$;$247 = $242;$249 = $243;
    label = 67;
   }
   else if ((label|0) == 71) {
    label = 0;
    $272 = (_memchr($$1,0,$$0254)|0);
    $273 = ($272|0)==(0|0);
    $274 = $272;
    $275 = $$1;
    $276 = (($274) - ($275))|0;
    $277 = (($$1) + ($$0254)|0);
    $$3257 = $273 ? $$0254 : $276;
    $$1250 = $273 ? $277 : $272;
    $$2 = $$1;$$2234 = 0;$$2239 = 3916;$$2251 = $$1250;$$5 = $$3257;$$6268 = $164;
   }
   else if ((label|0) == 75) {
    label = 0;
    $$0229322 = $331;$$0240321 = 0;$$1244320 = 0;
    while(1) {
     $285 = HEAP32[$$0229322>>2]|0;
     $286 = ($285|0)==(0);
     if ($286) {
      $$0240$lcssa = $$0240321;$$2245 = $$1244320;
      break;
     }
     $287 = (_wctomb($9,$285)|0);
     $288 = ($287|0)<(0);
     $289 = (($$4258355) - ($$0240321))|0;
     $290 = ($287>>>0)>($289>>>0);
     $or$cond286 = $288 | $290;
     if ($or$cond286) {
      $$0240$lcssa = $$0240321;$$2245 = $287;
      break;
     }
     $291 = ((($$0229322)) + 4|0);
     $292 = (($287) + ($$0240321))|0;
     $293 = ($$4258355>>>0)>($292>>>0);
     if ($293) {
      $$0229322 = $291;$$0240321 = $292;$$1244320 = $287;
     } else {
      $$0240$lcssa = $292;$$2245 = $287;
      break;
     }
    }
    $294 = ($$2245|0)<(0);
    if ($294) {
     $$0 = -1;
     break L1;
    }
    _pad_506($0,32,$$1260,$$0240$lcssa,$$1263$);
    $295 = ($$0240$lcssa|0)==(0);
    if ($295) {
     $$0240$lcssa357 = 0;
     label = 84;
    } else {
     $$1230333 = $331;$$1241332 = 0;
     while(1) {
      $296 = HEAP32[$$1230333>>2]|0;
      $297 = ($296|0)==(0);
      if ($297) {
       $$0240$lcssa357 = $$0240$lcssa;
       label = 84;
       break L95;
      }
      $298 = (_wctomb($9,$296)|0);
      $299 = (($298) + ($$1241332))|0;
      $300 = ($299|0)>($$0240$lcssa|0);
      if ($300) {
       $$0240$lcssa357 = $$0240$lcssa;
       label = 84;
       break L95;
      }
      $301 = ((($$1230333)) + 4|0);
      _out_500($0,$9,$298);
      $302 = ($299>>>0)<($$0240$lcssa>>>0);
      if ($302) {
       $$1230333 = $301;$$1241332 = $299;
      } else {
       $$0240$lcssa357 = $$0240$lcssa;
       label = 84;
       break;
      }
     }
    }
   }
  } while(0);
  if ((label|0) == 67) {
   label = 0;
   $245 = ($$2256|0)>(-1);
   $246 = $$4266 & -65537;
   $$$4266 = $245 ? $246 : $$4266;
   $248 = ($247|0)!=(0);
   $250 = ($249|0)!=(0);
   $251 = $248 | $250;
   $252 = ($$2256|0)!=(0);
   $or$cond = $252 | $251;
   $253 = $$0228;
   $254 = (($12) - ($253))|0;
   $255 = $251 ^ 1;
   $256 = $255&1;
   $257 = (($256) + ($254))|0;
   $258 = ($$2256|0)>($257|0);
   $$2256$ = $258 ? $$2256 : $257;
   $$2256$$$2256 = $or$cond ? $$2256$ : $$2256;
   $$0228$ = $or$cond ? $$0228 : $11;
   $$2 = $$0228$;$$2234 = $$1233;$$2239 = $$1238;$$2251 = $11;$$5 = $$2256$$$2256;$$6268 = $$$4266;
  }
  else if ((label|0) == 84) {
   label = 0;
   $303 = $$1263$ ^ 8192;
   _pad_506($0,32,$$1260,$$0240$lcssa357,$303);
   $304 = ($$1260|0)>($$0240$lcssa357|0);
   $305 = $304 ? $$1260 : $$0240$lcssa357;
   $$0243 = $305;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
   continue;
  }
  $308 = $$2251;
  $309 = $$2;
  $310 = (($308) - ($309))|0;
  $311 = ($$5|0)<($310|0);
  $$$5 = $311 ? $310 : $$5;
  $312 = (($$$5) + ($$2234))|0;
  $313 = ($$1260|0)<($312|0);
  $$2261 = $313 ? $312 : $$1260;
  _pad_506($0,32,$$2261,$312,$$6268);
  _out_500($0,$$2239,$$2234);
  $314 = $$6268 ^ 65536;
  _pad_506($0,48,$$2261,$312,$314);
  _pad_506($0,48,$$$5,$310,0);
  _out_500($0,$$2,$310);
  $315 = $$6268 ^ 8192;
  _pad_506($0,32,$$2261,$312,$315);
  $$0243 = $$2261;$$0247 = $$1248;$$0269 = $$3272;$21 = $132;
 }
 L114: do {
  if ((label|0) == 87) {
   $316 = ($0|0)==(0|0);
   if ($316) {
    $317 = ($$0269|0)==(0);
    if ($317) {
     $$0 = 0;
    } else {
     $$2242305 = 1;
     while(1) {
      $318 = (($4) + ($$2242305<<2)|0);
      $319 = HEAP32[$318>>2]|0;
      $320 = ($319|0)==(0);
      if ($320) {
       $$3303 = $$2242305;
       break;
      }
      $321 = (($3) + ($$2242305<<3)|0);
      _pop_arg_503($321,$319,$2);
      $322 = (($$2242305) + 1)|0;
      $323 = ($322|0)<(10);
      if ($323) {
       $$2242305 = $322;
      } else {
       $$0 = 1;
       break L114;
      }
     }
     while(1) {
      $326 = (($4) + ($$3303<<2)|0);
      $327 = HEAP32[$326>>2]|0;
      $328 = ($327|0)==(0);
      $324 = (($$3303) + 1)|0;
      if (!($328)) {
       $$0 = -1;
       break L114;
      }
      $325 = ($324|0)<(10);
      if ($325) {
       $$3303 = $324;
      } else {
       $$0 = 1;
       break;
      }
     }
    }
   } else {
    $$0 = $$1248;
   }
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function ___lockfile($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function ___unlockfile($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _out_500($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = HEAP32[$0>>2]|0;
 $4 = $3 & 32;
 $5 = ($4|0)==(0);
 if ($5) {
  (___fwritex($1,$2,$0)|0);
 }
 return;
}
function _getint_501($0) {
 $0 = $0|0;
 var $$0$lcssa = 0, $$06 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $isdigit = 0, $isdigit5 = 0, $isdigittmp = 0, $isdigittmp4 = 0, $isdigittmp7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = HEAP8[$1>>0]|0;
 $3 = $2 << 24 >> 24;
 $isdigittmp4 = (($3) + -48)|0;
 $isdigit5 = ($isdigittmp4>>>0)<(10);
 if ($isdigit5) {
  $$06 = 0;$7 = $1;$isdigittmp7 = $isdigittmp4;
  while(1) {
   $4 = ($$06*10)|0;
   $5 = (($isdigittmp7) + ($4))|0;
   $6 = ((($7)) + 1|0);
   HEAP32[$0>>2] = $6;
   $8 = HEAP8[$6>>0]|0;
   $9 = $8 << 24 >> 24;
   $isdigittmp = (($9) + -48)|0;
   $isdigit = ($isdigittmp>>>0)<(10);
   if ($isdigit) {
    $$06 = $5;$7 = $6;$isdigittmp7 = $isdigittmp;
   } else {
    $$0$lcssa = $5;
    break;
   }
  }
 } else {
  $$0$lcssa = 0;
 }
 return ($$0$lcssa|0);
}
function _pop_arg_503($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$mask = 0, $$mask31 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0.0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0.0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0;
 var $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $arglist_current = 0, $arglist_current11 = 0, $arglist_current14 = 0, $arglist_current17 = 0;
 var $arglist_current2 = 0, $arglist_current20 = 0, $arglist_current23 = 0, $arglist_current26 = 0, $arglist_current5 = 0, $arglist_current8 = 0, $arglist_next = 0, $arglist_next12 = 0, $arglist_next15 = 0, $arglist_next18 = 0, $arglist_next21 = 0, $arglist_next24 = 0, $arglist_next27 = 0, $arglist_next3 = 0, $arglist_next6 = 0, $arglist_next9 = 0, $expanded = 0, $expanded28 = 0, $expanded30 = 0, $expanded31 = 0;
 var $expanded32 = 0, $expanded34 = 0, $expanded35 = 0, $expanded37 = 0, $expanded38 = 0, $expanded39 = 0, $expanded41 = 0, $expanded42 = 0, $expanded44 = 0, $expanded45 = 0, $expanded46 = 0, $expanded48 = 0, $expanded49 = 0, $expanded51 = 0, $expanded52 = 0, $expanded53 = 0, $expanded55 = 0, $expanded56 = 0, $expanded58 = 0, $expanded59 = 0;
 var $expanded60 = 0, $expanded62 = 0, $expanded63 = 0, $expanded65 = 0, $expanded66 = 0, $expanded67 = 0, $expanded69 = 0, $expanded70 = 0, $expanded72 = 0, $expanded73 = 0, $expanded74 = 0, $expanded76 = 0, $expanded77 = 0, $expanded79 = 0, $expanded80 = 0, $expanded81 = 0, $expanded83 = 0, $expanded84 = 0, $expanded86 = 0, $expanded87 = 0;
 var $expanded88 = 0, $expanded90 = 0, $expanded91 = 0, $expanded93 = 0, $expanded94 = 0, $expanded95 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($1>>>0)>(20);
 L1: do {
  if (!($3)) {
   do {
    switch ($1|0) {
    case 9:  {
     $arglist_current = HEAP32[$2>>2]|0;
     $4 = $arglist_current;
     $5 = ((0) + 4|0);
     $expanded28 = $5;
     $expanded = (($expanded28) - 1)|0;
     $6 = (($4) + ($expanded))|0;
     $7 = ((0) + 4|0);
     $expanded32 = $7;
     $expanded31 = (($expanded32) - 1)|0;
     $expanded30 = $expanded31 ^ -1;
     $8 = $6 & $expanded30;
     $9 = $8;
     $10 = HEAP32[$9>>2]|0;
     $arglist_next = ((($9)) + 4|0);
     HEAP32[$2>>2] = $arglist_next;
     HEAP32[$0>>2] = $10;
     break L1;
     break;
    }
    case 10:  {
     $arglist_current2 = HEAP32[$2>>2]|0;
     $11 = $arglist_current2;
     $12 = ((0) + 4|0);
     $expanded35 = $12;
     $expanded34 = (($expanded35) - 1)|0;
     $13 = (($11) + ($expanded34))|0;
     $14 = ((0) + 4|0);
     $expanded39 = $14;
     $expanded38 = (($expanded39) - 1)|0;
     $expanded37 = $expanded38 ^ -1;
     $15 = $13 & $expanded37;
     $16 = $15;
     $17 = HEAP32[$16>>2]|0;
     $arglist_next3 = ((($16)) + 4|0);
     HEAP32[$2>>2] = $arglist_next3;
     $18 = ($17|0)<(0);
     $19 = $18 << 31 >> 31;
     $20 = $0;
     $21 = $20;
     HEAP32[$21>>2] = $17;
     $22 = (($20) + 4)|0;
     $23 = $22;
     HEAP32[$23>>2] = $19;
     break L1;
     break;
    }
    case 11:  {
     $arglist_current5 = HEAP32[$2>>2]|0;
     $24 = $arglist_current5;
     $25 = ((0) + 4|0);
     $expanded42 = $25;
     $expanded41 = (($expanded42) - 1)|0;
     $26 = (($24) + ($expanded41))|0;
     $27 = ((0) + 4|0);
     $expanded46 = $27;
     $expanded45 = (($expanded46) - 1)|0;
     $expanded44 = $expanded45 ^ -1;
     $28 = $26 & $expanded44;
     $29 = $28;
     $30 = HEAP32[$29>>2]|0;
     $arglist_next6 = ((($29)) + 4|0);
     HEAP32[$2>>2] = $arglist_next6;
     $31 = $0;
     $32 = $31;
     HEAP32[$32>>2] = $30;
     $33 = (($31) + 4)|0;
     $34 = $33;
     HEAP32[$34>>2] = 0;
     break L1;
     break;
    }
    case 12:  {
     $arglist_current8 = HEAP32[$2>>2]|0;
     $35 = $arglist_current8;
     $36 = ((0) + 8|0);
     $expanded49 = $36;
     $expanded48 = (($expanded49) - 1)|0;
     $37 = (($35) + ($expanded48))|0;
     $38 = ((0) + 8|0);
     $expanded53 = $38;
     $expanded52 = (($expanded53) - 1)|0;
     $expanded51 = $expanded52 ^ -1;
     $39 = $37 & $expanded51;
     $40 = $39;
     $41 = $40;
     $42 = $41;
     $43 = HEAP32[$42>>2]|0;
     $44 = (($41) + 4)|0;
     $45 = $44;
     $46 = HEAP32[$45>>2]|0;
     $arglist_next9 = ((($40)) + 8|0);
     HEAP32[$2>>2] = $arglist_next9;
     $47 = $0;
     $48 = $47;
     HEAP32[$48>>2] = $43;
     $49 = (($47) + 4)|0;
     $50 = $49;
     HEAP32[$50>>2] = $46;
     break L1;
     break;
    }
    case 13:  {
     $arglist_current11 = HEAP32[$2>>2]|0;
     $51 = $arglist_current11;
     $52 = ((0) + 4|0);
     $expanded56 = $52;
     $expanded55 = (($expanded56) - 1)|0;
     $53 = (($51) + ($expanded55))|0;
     $54 = ((0) + 4|0);
     $expanded60 = $54;
     $expanded59 = (($expanded60) - 1)|0;
     $expanded58 = $expanded59 ^ -1;
     $55 = $53 & $expanded58;
     $56 = $55;
     $57 = HEAP32[$56>>2]|0;
     $arglist_next12 = ((($56)) + 4|0);
     HEAP32[$2>>2] = $arglist_next12;
     $58 = $57&65535;
     $59 = $58 << 16 >> 16;
     $60 = ($59|0)<(0);
     $61 = $60 << 31 >> 31;
     $62 = $0;
     $63 = $62;
     HEAP32[$63>>2] = $59;
     $64 = (($62) + 4)|0;
     $65 = $64;
     HEAP32[$65>>2] = $61;
     break L1;
     break;
    }
    case 14:  {
     $arglist_current14 = HEAP32[$2>>2]|0;
     $66 = $arglist_current14;
     $67 = ((0) + 4|0);
     $expanded63 = $67;
     $expanded62 = (($expanded63) - 1)|0;
     $68 = (($66) + ($expanded62))|0;
     $69 = ((0) + 4|0);
     $expanded67 = $69;
     $expanded66 = (($expanded67) - 1)|0;
     $expanded65 = $expanded66 ^ -1;
     $70 = $68 & $expanded65;
     $71 = $70;
     $72 = HEAP32[$71>>2]|0;
     $arglist_next15 = ((($71)) + 4|0);
     HEAP32[$2>>2] = $arglist_next15;
     $$mask31 = $72 & 65535;
     $73 = $0;
     $74 = $73;
     HEAP32[$74>>2] = $$mask31;
     $75 = (($73) + 4)|0;
     $76 = $75;
     HEAP32[$76>>2] = 0;
     break L1;
     break;
    }
    case 15:  {
     $arglist_current17 = HEAP32[$2>>2]|0;
     $77 = $arglist_current17;
     $78 = ((0) + 4|0);
     $expanded70 = $78;
     $expanded69 = (($expanded70) - 1)|0;
     $79 = (($77) + ($expanded69))|0;
     $80 = ((0) + 4|0);
     $expanded74 = $80;
     $expanded73 = (($expanded74) - 1)|0;
     $expanded72 = $expanded73 ^ -1;
     $81 = $79 & $expanded72;
     $82 = $81;
     $83 = HEAP32[$82>>2]|0;
     $arglist_next18 = ((($82)) + 4|0);
     HEAP32[$2>>2] = $arglist_next18;
     $84 = $83&255;
     $85 = $84 << 24 >> 24;
     $86 = ($85|0)<(0);
     $87 = $86 << 31 >> 31;
     $88 = $0;
     $89 = $88;
     HEAP32[$89>>2] = $85;
     $90 = (($88) + 4)|0;
     $91 = $90;
     HEAP32[$91>>2] = $87;
     break L1;
     break;
    }
    case 16:  {
     $arglist_current20 = HEAP32[$2>>2]|0;
     $92 = $arglist_current20;
     $93 = ((0) + 4|0);
     $expanded77 = $93;
     $expanded76 = (($expanded77) - 1)|0;
     $94 = (($92) + ($expanded76))|0;
     $95 = ((0) + 4|0);
     $expanded81 = $95;
     $expanded80 = (($expanded81) - 1)|0;
     $expanded79 = $expanded80 ^ -1;
     $96 = $94 & $expanded79;
     $97 = $96;
     $98 = HEAP32[$97>>2]|0;
     $arglist_next21 = ((($97)) + 4|0);
     HEAP32[$2>>2] = $arglist_next21;
     $$mask = $98 & 255;
     $99 = $0;
     $100 = $99;
     HEAP32[$100>>2] = $$mask;
     $101 = (($99) + 4)|0;
     $102 = $101;
     HEAP32[$102>>2] = 0;
     break L1;
     break;
    }
    case 17:  {
     $arglist_current23 = HEAP32[$2>>2]|0;
     $103 = $arglist_current23;
     $104 = ((0) + 8|0);
     $expanded84 = $104;
     $expanded83 = (($expanded84) - 1)|0;
     $105 = (($103) + ($expanded83))|0;
     $106 = ((0) + 8|0);
     $expanded88 = $106;
     $expanded87 = (($expanded88) - 1)|0;
     $expanded86 = $expanded87 ^ -1;
     $107 = $105 & $expanded86;
     $108 = $107;
     $109 = +HEAPF64[$108>>3];
     $arglist_next24 = ((($108)) + 8|0);
     HEAP32[$2>>2] = $arglist_next24;
     HEAPF64[$0>>3] = $109;
     break L1;
     break;
    }
    case 18:  {
     $arglist_current26 = HEAP32[$2>>2]|0;
     $110 = $arglist_current26;
     $111 = ((0) + 8|0);
     $expanded91 = $111;
     $expanded90 = (($expanded91) - 1)|0;
     $112 = (($110) + ($expanded90))|0;
     $113 = ((0) + 8|0);
     $expanded95 = $113;
     $expanded94 = (($expanded95) - 1)|0;
     $expanded93 = $expanded94 ^ -1;
     $114 = $112 & $expanded93;
     $115 = $114;
     $116 = +HEAPF64[$115>>3];
     $arglist_next27 = ((($115)) + 8|0);
     HEAP32[$2>>2] = $arglist_next27;
     HEAPF64[$0>>3] = $116;
     break L1;
     break;
    }
    default: {
     break L1;
    }
    }
   } while(0);
  }
 } while(0);
 return;
}
function _fmt_x($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$05$lcssa = 0, $$056 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $4 = ($0|0)==(0);
 $5 = ($1|0)==(0);
 $6 = $4 & $5;
 if ($6) {
  $$05$lcssa = $2;
 } else {
  $$056 = $2;$15 = $1;$8 = $0;
  while(1) {
   $7 = $8 & 15;
   $9 = (3968 + ($7)|0);
   $10 = HEAP8[$9>>0]|0;
   $11 = $10&255;
   $12 = $11 | $3;
   $13 = $12&255;
   $14 = ((($$056)) + -1|0);
   HEAP8[$14>>0] = $13;
   $16 = (_bitshift64Lshr(($8|0),($15|0),4)|0);
   $17 = tempRet0;
   $18 = ($16|0)==(0);
   $19 = ($17|0)==(0);
   $20 = $18 & $19;
   if ($20) {
    $$05$lcssa = $14;
    break;
   } else {
    $$056 = $14;$15 = $17;$8 = $16;
   }
  }
 }
 return ($$05$lcssa|0);
}
function _fmt_o($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($0|0)==(0);
 $4 = ($1|0)==(0);
 $5 = $3 & $4;
 if ($5) {
  $$0$lcssa = $2;
 } else {
  $$06 = $2;$11 = $1;$7 = $0;
  while(1) {
   $6 = $7&255;
   $8 = $6 & 7;
   $9 = $8 | 48;
   $10 = ((($$06)) + -1|0);
   HEAP8[$10>>0] = $9;
   $12 = (_bitshift64Lshr(($7|0),($11|0),3)|0);
   $13 = tempRet0;
   $14 = ($12|0)==(0);
   $15 = ($13|0)==(0);
   $16 = $14 & $15;
   if ($16) {
    $$0$lcssa = $10;
    break;
   } else {
    $$06 = $10;$11 = $13;$7 = $12;
   }
  }
 }
 return ($$0$lcssa|0);
}
function _fmt_u($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($1>>>0)>(0);
 $4 = ($0>>>0)>(4294967295);
 $5 = ($1|0)==(0);
 $6 = $5 & $4;
 $7 = $3 | $6;
 if ($7) {
  $$0914 = $2;$8 = $0;$9 = $1;
  while(1) {
   $10 = (___uremdi3(($8|0),($9|0),10,0)|0);
   $11 = tempRet0;
   $12 = $10&255;
   $13 = $12 | 48;
   $14 = ((($$0914)) + -1|0);
   HEAP8[$14>>0] = $13;
   $15 = (___udivdi3(($8|0),($9|0),10,0)|0);
   $16 = tempRet0;
   $17 = ($9>>>0)>(9);
   $18 = ($8>>>0)>(4294967295);
   $19 = ($9|0)==(9);
   $20 = $19 & $18;
   $21 = $17 | $20;
   if ($21) {
    $$0914 = $14;$8 = $15;$9 = $16;
   } else {
    break;
   }
  }
  $$010$lcssa$off0 = $15;$$09$lcssa = $14;
 } else {
  $$010$lcssa$off0 = $0;$$09$lcssa = $2;
 }
 $22 = ($$010$lcssa$off0|0)==(0);
 if ($22) {
  $$1$lcssa = $$09$lcssa;
 } else {
  $$012 = $$010$lcssa$off0;$$111 = $$09$lcssa;
  while(1) {
   $23 = (($$012>>>0) % 10)&-1;
   $24 = $23 | 48;
   $25 = $24&255;
   $26 = ((($$111)) + -1|0);
   HEAP8[$26>>0] = $25;
   $27 = (($$012>>>0) / 10)&-1;
   $28 = ($$012>>>0)<(10);
   if ($28) {
    $$1$lcssa = $26;
    break;
   } else {
    $$012 = $27;$$111 = $26;
   }
  }
 }
 return ($$1$lcssa|0);
}
function _strerror($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (___pthread_self_705()|0);
 $2 = ((($1)) + 188|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = (___strerror_l($0,$3)|0);
 return ($4|0);
}
function _memchr($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0;
 var $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0;
 var $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond53 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = $1 & 255;
 $4 = $0;
 $5 = $4 & 3;
 $6 = ($5|0)!=(0);
 $7 = ($2|0)!=(0);
 $or$cond53 = $7 & $6;
 L1: do {
  if ($or$cond53) {
   $8 = $1&255;
   $$03555 = $0;$$03654 = $2;
   while(1) {
    $9 = HEAP8[$$03555>>0]|0;
    $10 = ($9<<24>>24)==($8<<24>>24);
    if ($10) {
     $$035$lcssa65 = $$03555;$$036$lcssa64 = $$03654;
     label = 6;
     break L1;
    }
    $11 = ((($$03555)) + 1|0);
    $12 = (($$03654) + -1)|0;
    $13 = $11;
    $14 = $13 & 3;
    $15 = ($14|0)!=(0);
    $16 = ($12|0)!=(0);
    $or$cond = $16 & $15;
    if ($or$cond) {
     $$03555 = $11;$$03654 = $12;
    } else {
     $$035$lcssa = $11;$$036$lcssa = $12;$$lcssa = $16;
     label = 5;
     break;
    }
   }
  } else {
   $$035$lcssa = $0;$$036$lcssa = $2;$$lcssa = $7;
   label = 5;
  }
 } while(0);
 if ((label|0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa;$$036$lcssa64 = $$036$lcssa;
   label = 6;
  } else {
   $$2 = $$035$lcssa;$$3 = 0;
  }
 }
 L8: do {
  if ((label|0) == 6) {
   $17 = HEAP8[$$035$lcssa65>>0]|0;
   $18 = $1&255;
   $19 = ($17<<24>>24)==($18<<24>>24);
   if ($19) {
    $$2 = $$035$lcssa65;$$3 = $$036$lcssa64;
   } else {
    $20 = Math_imul($3, 16843009)|0;
    $21 = ($$036$lcssa64>>>0)>(3);
    L11: do {
     if ($21) {
      $$046 = $$035$lcssa65;$$13745 = $$036$lcssa64;
      while(1) {
       $22 = HEAP32[$$046>>2]|0;
       $23 = $22 ^ $20;
       $24 = (($23) + -16843009)|0;
       $25 = $23 & -2139062144;
       $26 = $25 ^ -2139062144;
       $27 = $26 & $24;
       $28 = ($27|0)==(0);
       if (!($28)) {
        break;
       }
       $29 = ((($$046)) + 4|0);
       $30 = (($$13745) + -4)|0;
       $31 = ($30>>>0)>(3);
       if ($31) {
        $$046 = $29;$$13745 = $30;
       } else {
        $$0$lcssa = $29;$$137$lcssa = $30;
        label = 11;
        break L11;
       }
      }
      $$140 = $$046;$$23839 = $$13745;
     } else {
      $$0$lcssa = $$035$lcssa65;$$137$lcssa = $$036$lcssa64;
      label = 11;
     }
    } while(0);
    if ((label|0) == 11) {
     $32 = ($$137$lcssa|0)==(0);
     if ($32) {
      $$2 = $$0$lcssa;$$3 = 0;
      break;
     } else {
      $$140 = $$0$lcssa;$$23839 = $$137$lcssa;
     }
    }
    while(1) {
     $33 = HEAP8[$$140>>0]|0;
     $34 = ($33<<24>>24)==($18<<24>>24);
     if ($34) {
      $$2 = $$140;$$3 = $$23839;
      break L8;
     }
     $35 = ((($$140)) + 1|0);
     $36 = (($$23839) + -1)|0;
     $37 = ($36|0)==(0);
     if ($37) {
      $$2 = $35;$$3 = 0;
      break;
     } else {
      $$140 = $35;$$23839 = $36;
     }
    }
   }
  }
 } while(0);
 $38 = ($$3|0)!=(0);
 $39 = $38 ? $$2 : 0;
 return ($39|0);
}
function _pad_506($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$0$lcssa = 0, $$011 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 256|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(256|0);
 $5 = sp;
 $6 = $4 & 73728;
 $7 = ($6|0)==(0);
 $8 = ($2|0)>($3|0);
 $or$cond = $8 & $7;
 if ($or$cond) {
  $9 = (($2) - ($3))|0;
  $10 = ($9>>>0)<(256);
  $11 = $10 ? $9 : 256;
  _memset(($5|0),($1|0),($11|0))|0;
  $12 = ($9>>>0)>(255);
  if ($12) {
   $13 = (($2) - ($3))|0;
   $$011 = $9;
   while(1) {
    _out_500($0,$5,256);
    $14 = (($$011) + -256)|0;
    $15 = ($14>>>0)>(255);
    if ($15) {
     $$011 = $14;
    } else {
     break;
    }
   }
   $16 = $13 & 255;
   $$0$lcssa = $16;
  } else {
   $$0$lcssa = $9;
  }
  _out_500($0,$5,$$0$lcssa);
 }
 STACKTOP = sp;return;
}
function _wctomb($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($0|0)==(0|0);
 if ($2) {
  $$0 = 0;
 } else {
  $3 = (_wcrtomb($0,$1,0)|0);
  $$0 = $3;
 }
 return ($$0|0);
}
function _fmt_fp($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = +$1;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $$ = 0, $$$ = 0, $$$$559 = 0.0, $$$3484 = 0, $$$3484691 = 0, $$$3484692 = 0, $$$3501 = 0, $$$4502 = 0, $$$542 = 0.0, $$$559 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463584 = 0, $$0464594 = 0, $$0471 = 0.0, $$0479 = 0, $$0487642 = 0, $$0488 = 0, $$0488653 = 0, $$0488655 = 0;
 var $$0496$$9 = 0, $$0497654 = 0, $$0498 = 0, $$0509582 = 0.0, $$0510 = 0, $$0511 = 0, $$0514637 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0525 = 0, $$0527 = 0, $$0527629 = 0, $$0527631 = 0, $$0530636 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0;
 var $$1480 = 0, $$1482$lcssa = 0, $$1482661 = 0, $$1489641 = 0, $$1499$lcssa = 0, $$1499660 = 0, $$1508583 = 0, $$1512$lcssa = 0, $$1512607 = 0, $$1515 = 0, $$1524 = 0, $$1526 = 0, $$1528614 = 0, $$1531$lcssa = 0, $$1531630 = 0, $$1598 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2476$$547 = 0;
 var $$2476$$549 = 0, $$2483$ph = 0, $$2500 = 0, $$2513 = 0, $$2516618 = 0, $$2529 = 0, $$2532617 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484648 = 0, $$3501$lcssa = 0, $$3501647 = 0, $$3533613 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478590 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0;
 var $$5$lcssa = 0, $$534$ = 0, $$539 = 0, $$539$ = 0, $$542 = 0.0, $$546 = 0, $$548 = 0, $$5486$lcssa = 0, $$5486623 = 0, $$5493597 = 0, $$5519$ph = 0, $$555 = 0, $$556 = 0, $$559 = 0.0, $$5602 = 0, $$6 = 0, $$6494589 = 0, $$7495601 = 0, $$7505 = 0, $$7505$ = 0;
 var $$7505$ph = 0, $$8 = 0, $$9$ph = 0, $$lcssa673 = 0, $$neg = 0, $$neg567 = 0, $$pn = 0, $$pn566 = 0, $$pr = 0, $$pr564 = 0, $$pre = 0, $$pre$phi690Z2D = 0, $$pre689 = 0, $$sink545$lcssa = 0, $$sink545622 = 0, $$sink562 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0;
 var $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0.0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0.0, $117 = 0.0, $118 = 0.0, $119 = 0, $12 = 0, $120 = 0;
 var $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0;
 var $14 = 0.0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0;
 var $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0;
 var $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0;
 var $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0;
 var $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0.0, $229 = 0.0, $23 = 0;
 var $230 = 0, $231 = 0.0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0;
 var $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0;
 var $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0;
 var $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0;
 var $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0;
 var $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0;
 var $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0.0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0;
 var $358 = 0, $359 = 0, $36 = 0.0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0;
 var $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0, $51 = 0.0, $52 = 0, $53 = 0, $54 = 0, $55 = 0.0, $56 = 0.0, $57 = 0.0, $58 = 0.0, $59 = 0.0, $6 = 0, $60 = 0.0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0;
 var $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0.0, $88 = 0.0, $89 = 0.0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $exitcond = 0;
 var $narrow = 0, $not$ = 0, $notlhs = 0, $notrhs = 0, $or$cond = 0, $or$cond3$not = 0, $or$cond537 = 0, $or$cond541 = 0, $or$cond544 = 0, $or$cond554 = 0, $or$cond6 = 0, $scevgep684 = 0, $scevgep684685 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 560|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(560|0);
 $6 = sp + 8|0;
 $7 = sp;
 $8 = sp + 524|0;
 $9 = $8;
 $10 = sp + 512|0;
 HEAP32[$7>>2] = 0;
 $11 = ((($10)) + 12|0);
 (___DOUBLE_BITS_507($1)|0);
 $12 = tempRet0;
 $13 = ($12|0)<(0);
 if ($13) {
  $14 = -$1;
  $$0471 = $14;$$0520 = 1;$$0521 = 3933;
 } else {
  $15 = $4 & 2048;
  $16 = ($15|0)==(0);
  $17 = $4 & 1;
  $18 = ($17|0)==(0);
  $$ = $18 ? (3934) : (3939);
  $$$ = $16 ? $$ : (3936);
  $19 = $4 & 2049;
  $narrow = ($19|0)!=(0);
  $$534$ = $narrow&1;
  $$0471 = $1;$$0520 = $$534$;$$0521 = $$$;
 }
 (___DOUBLE_BITS_507($$0471)|0);
 $20 = tempRet0;
 $21 = $20 & 2146435072;
 $22 = ($21>>>0)<(2146435072);
 $23 = (0)<(0);
 $24 = ($21|0)==(2146435072);
 $25 = $24 & $23;
 $26 = $22 | $25;
 do {
  if ($26) {
   $35 = (+_frexpl($$0471,$7));
   $36 = $35 * 2.0;
   $37 = $36 != 0.0;
   if ($37) {
    $38 = HEAP32[$7>>2]|0;
    $39 = (($38) + -1)|0;
    HEAP32[$7>>2] = $39;
   }
   $40 = $5 | 32;
   $41 = ($40|0)==(97);
   if ($41) {
    $42 = $5 & 32;
    $43 = ($42|0)==(0);
    $44 = ((($$0521)) + 9|0);
    $$0521$ = $43 ? $$0521 : $44;
    $45 = $$0520 | 2;
    $46 = ($3>>>0)>(11);
    $47 = (12 - ($3))|0;
    $48 = ($47|0)==(0);
    $49 = $46 | $48;
    do {
     if ($49) {
      $$1472 = $36;
     } else {
      $$0509582 = 8.0;$$1508583 = $47;
      while(1) {
       $50 = (($$1508583) + -1)|0;
       $51 = $$0509582 * 16.0;
       $52 = ($50|0)==(0);
       if ($52) {
        break;
       } else {
        $$0509582 = $51;$$1508583 = $50;
       }
      }
      $53 = HEAP8[$$0521$>>0]|0;
      $54 = ($53<<24>>24)==(45);
      if ($54) {
       $55 = -$36;
       $56 = $55 - $51;
       $57 = $51 + $56;
       $58 = -$57;
       $$1472 = $58;
       break;
      } else {
       $59 = $36 + $51;
       $60 = $59 - $51;
       $$1472 = $60;
       break;
      }
     }
    } while(0);
    $61 = HEAP32[$7>>2]|0;
    $62 = ($61|0)<(0);
    $63 = (0 - ($61))|0;
    $64 = $62 ? $63 : $61;
    $65 = ($64|0)<(0);
    $66 = $65 << 31 >> 31;
    $67 = (_fmt_u($64,$66,$11)|0);
    $68 = ($67|0)==($11|0);
    if ($68) {
     $69 = ((($10)) + 11|0);
     HEAP8[$69>>0] = 48;
     $$0511 = $69;
    } else {
     $$0511 = $67;
    }
    $70 = $61 >> 31;
    $71 = $70 & 2;
    $72 = (($71) + 43)|0;
    $73 = $72&255;
    $74 = ((($$0511)) + -1|0);
    HEAP8[$74>>0] = $73;
    $75 = (($5) + 15)|0;
    $76 = $75&255;
    $77 = ((($$0511)) + -2|0);
    HEAP8[$77>>0] = $76;
    $notrhs = ($3|0)<(1);
    $78 = $4 & 8;
    $79 = ($78|0)==(0);
    $$0523 = $8;$$2473 = $$1472;
    while(1) {
     $80 = (~~(($$2473)));
     $81 = (3968 + ($80)|0);
     $82 = HEAP8[$81>>0]|0;
     $83 = $82&255;
     $84 = $83 | $42;
     $85 = $84&255;
     $86 = ((($$0523)) + 1|0);
     HEAP8[$$0523>>0] = $85;
     $87 = (+($80|0));
     $88 = $$2473 - $87;
     $89 = $88 * 16.0;
     $90 = $86;
     $91 = (($90) - ($9))|0;
     $92 = ($91|0)==(1);
     if ($92) {
      $notlhs = $89 == 0.0;
      $or$cond3$not = $notrhs & $notlhs;
      $or$cond = $79 & $or$cond3$not;
      if ($or$cond) {
       $$1524 = $86;
      } else {
       $93 = ((($$0523)) + 2|0);
       HEAP8[$86>>0] = 46;
       $$1524 = $93;
      }
     } else {
      $$1524 = $86;
     }
     $94 = $89 != 0.0;
     if ($94) {
      $$0523 = $$1524;$$2473 = $89;
     } else {
      break;
     }
    }
    $95 = ($3|0)!=(0);
    $96 = $77;
    $97 = $11;
    $98 = $$1524;
    $99 = (($98) - ($9))|0;
    $100 = (($97) - ($96))|0;
    $101 = (($99) + -2)|0;
    $102 = ($101|0)<($3|0);
    $or$cond537 = $95 & $102;
    $103 = (($3) + 2)|0;
    $$pn = $or$cond537 ? $103 : $99;
    $$0525 = (($100) + ($45))|0;
    $104 = (($$0525) + ($$pn))|0;
    _pad_506($0,32,$2,$104,$4);
    _out_500($0,$$0521$,$45);
    $105 = $4 ^ 65536;
    _pad_506($0,48,$2,$104,$105);
    _out_500($0,$8,$99);
    $106 = (($$pn) - ($99))|0;
    _pad_506($0,48,$106,0,0);
    _out_500($0,$77,$100);
    $107 = $4 ^ 8192;
    _pad_506($0,32,$2,$104,$107);
    $$sink562 = $104;
    break;
   }
   $108 = ($3|0)<(0);
   $$539 = $108 ? 6 : $3;
   if ($37) {
    $109 = $36 * 268435456.0;
    $110 = HEAP32[$7>>2]|0;
    $111 = (($110) + -28)|0;
    HEAP32[$7>>2] = $111;
    $$3 = $109;$$pr = $111;
   } else {
    $$pre = HEAP32[$7>>2]|0;
    $$3 = $36;$$pr = $$pre;
   }
   $112 = ($$pr|0)<(0);
   $113 = ((($6)) + 288|0);
   $$556 = $112 ? $6 : $113;
   $$0498 = $$556;$$4 = $$3;
   while(1) {
    $114 = (~~(($$4))>>>0);
    HEAP32[$$0498>>2] = $114;
    $115 = ((($$0498)) + 4|0);
    $116 = (+($114>>>0));
    $117 = $$4 - $116;
    $118 = $117 * 1.0E+9;
    $119 = $118 != 0.0;
    if ($119) {
     $$0498 = $115;$$4 = $118;
    } else {
     break;
    }
   }
   $120 = ($$pr|0)>(0);
   if ($120) {
    $$1482661 = $$556;$$1499660 = $115;$121 = $$pr;
    while(1) {
     $122 = ($121|0)<(29);
     $123 = $122 ? $121 : 29;
     $$0488653 = ((($$1499660)) + -4|0);
     $124 = ($$0488653>>>0)<($$1482661>>>0);
     if ($124) {
      $$2483$ph = $$1482661;
     } else {
      $$0488655 = $$0488653;$$0497654 = 0;
      while(1) {
       $125 = HEAP32[$$0488655>>2]|0;
       $126 = (_bitshift64Shl(($125|0),0,($123|0))|0);
       $127 = tempRet0;
       $128 = (_i64Add(($126|0),($127|0),($$0497654|0),0)|0);
       $129 = tempRet0;
       $130 = (___uremdi3(($128|0),($129|0),1000000000,0)|0);
       $131 = tempRet0;
       HEAP32[$$0488655>>2] = $130;
       $132 = (___udivdi3(($128|0),($129|0),1000000000,0)|0);
       $133 = tempRet0;
       $$0488 = ((($$0488655)) + -4|0);
       $134 = ($$0488>>>0)<($$1482661>>>0);
       if ($134) {
        break;
       } else {
        $$0488655 = $$0488;$$0497654 = $132;
       }
      }
      $135 = ($132|0)==(0);
      if ($135) {
       $$2483$ph = $$1482661;
      } else {
       $136 = ((($$1482661)) + -4|0);
       HEAP32[$136>>2] = $132;
       $$2483$ph = $136;
      }
     }
     $$2500 = $$1499660;
     while(1) {
      $137 = ($$2500>>>0)>($$2483$ph>>>0);
      if (!($137)) {
       break;
      }
      $138 = ((($$2500)) + -4|0);
      $139 = HEAP32[$138>>2]|0;
      $140 = ($139|0)==(0);
      if ($140) {
       $$2500 = $138;
      } else {
       break;
      }
     }
     $141 = HEAP32[$7>>2]|0;
     $142 = (($141) - ($123))|0;
     HEAP32[$7>>2] = $142;
     $143 = ($142|0)>(0);
     if ($143) {
      $$1482661 = $$2483$ph;$$1499660 = $$2500;$121 = $142;
     } else {
      $$1482$lcssa = $$2483$ph;$$1499$lcssa = $$2500;$$pr564 = $142;
      break;
     }
    }
   } else {
    $$1482$lcssa = $$556;$$1499$lcssa = $115;$$pr564 = $$pr;
   }
   $144 = ($$pr564|0)<(0);
   if ($144) {
    $145 = (($$539) + 25)|0;
    $146 = (($145|0) / 9)&-1;
    $147 = (($146) + 1)|0;
    $148 = ($40|0)==(102);
    $$3484648 = $$1482$lcssa;$$3501647 = $$1499$lcssa;$150 = $$pr564;
    while(1) {
     $149 = (0 - ($150))|0;
     $151 = ($149|0)<(9);
     $152 = $151 ? $149 : 9;
     $153 = ($$3484648>>>0)<($$3501647>>>0);
     if ($153) {
      $157 = 1 << $152;
      $158 = (($157) + -1)|0;
      $159 = 1000000000 >>> $152;
      $$0487642 = 0;$$1489641 = $$3484648;
      while(1) {
       $160 = HEAP32[$$1489641>>2]|0;
       $161 = $160 & $158;
       $162 = $160 >>> $152;
       $163 = (($162) + ($$0487642))|0;
       HEAP32[$$1489641>>2] = $163;
       $164 = Math_imul($161, $159)|0;
       $165 = ((($$1489641)) + 4|0);
       $166 = ($165>>>0)<($$3501647>>>0);
       if ($166) {
        $$0487642 = $164;$$1489641 = $165;
       } else {
        break;
       }
      }
      $167 = HEAP32[$$3484648>>2]|0;
      $168 = ($167|0)==(0);
      $169 = ((($$3484648)) + 4|0);
      $$$3484 = $168 ? $169 : $$3484648;
      $170 = ($164|0)==(0);
      if ($170) {
       $$$3484692 = $$$3484;$$4502 = $$3501647;
      } else {
       $171 = ((($$3501647)) + 4|0);
       HEAP32[$$3501647>>2] = $164;
       $$$3484692 = $$$3484;$$4502 = $171;
      }
     } else {
      $154 = HEAP32[$$3484648>>2]|0;
      $155 = ($154|0)==(0);
      $156 = ((($$3484648)) + 4|0);
      $$$3484691 = $155 ? $156 : $$3484648;
      $$$3484692 = $$$3484691;$$4502 = $$3501647;
     }
     $172 = $148 ? $$556 : $$$3484692;
     $173 = $$4502;
     $174 = $172;
     $175 = (($173) - ($174))|0;
     $176 = $175 >> 2;
     $177 = ($176|0)>($147|0);
     $178 = (($172) + ($147<<2)|0);
     $$$4502 = $177 ? $178 : $$4502;
     $179 = HEAP32[$7>>2]|0;
     $180 = (($179) + ($152))|0;
     HEAP32[$7>>2] = $180;
     $181 = ($180|0)<(0);
     if ($181) {
      $$3484648 = $$$3484692;$$3501647 = $$$4502;$150 = $180;
     } else {
      $$3484$lcssa = $$$3484692;$$3501$lcssa = $$$4502;
      break;
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa;$$3501$lcssa = $$1499$lcssa;
   }
   $182 = ($$3484$lcssa>>>0)<($$3501$lcssa>>>0);
   $183 = $$556;
   if ($182) {
    $184 = $$3484$lcssa;
    $185 = (($183) - ($184))|0;
    $186 = $185 >> 2;
    $187 = ($186*9)|0;
    $188 = HEAP32[$$3484$lcssa>>2]|0;
    $189 = ($188>>>0)<(10);
    if ($189) {
     $$1515 = $187;
    } else {
     $$0514637 = $187;$$0530636 = 10;
     while(1) {
      $190 = ($$0530636*10)|0;
      $191 = (($$0514637) + 1)|0;
      $192 = ($188>>>0)<($190>>>0);
      if ($192) {
       $$1515 = $191;
       break;
      } else {
       $$0514637 = $191;$$0530636 = $190;
      }
     }
    }
   } else {
    $$1515 = 0;
   }
   $193 = ($40|0)!=(102);
   $194 = $193 ? $$1515 : 0;
   $195 = (($$539) - ($194))|0;
   $196 = ($40|0)==(103);
   $197 = ($$539|0)!=(0);
   $198 = $197 & $196;
   $$neg = $198 << 31 >> 31;
   $199 = (($195) + ($$neg))|0;
   $200 = $$3501$lcssa;
   $201 = (($200) - ($183))|0;
   $202 = $201 >> 2;
   $203 = ($202*9)|0;
   $204 = (($203) + -9)|0;
   $205 = ($199|0)<($204|0);
   if ($205) {
    $206 = ((($$556)) + 4|0);
    $207 = (($199) + 9216)|0;
    $208 = (($207|0) / 9)&-1;
    $209 = (($208) + -1024)|0;
    $210 = (($206) + ($209<<2)|0);
    $211 = (($207|0) % 9)&-1;
    $$0527629 = (($211) + 1)|0;
    $212 = ($$0527629|0)<(9);
    if ($212) {
     $$0527631 = $$0527629;$$1531630 = 10;
     while(1) {
      $213 = ($$1531630*10)|0;
      $$0527 = (($$0527631) + 1)|0;
      $exitcond = ($$0527|0)==(9);
      if ($exitcond) {
       $$1531$lcssa = $213;
       break;
      } else {
       $$0527631 = $$0527;$$1531630 = $213;
      }
     }
    } else {
     $$1531$lcssa = 10;
    }
    $214 = HEAP32[$210>>2]|0;
    $215 = (($214>>>0) % ($$1531$lcssa>>>0))&-1;
    $216 = ($215|0)==(0);
    $217 = ((($210)) + 4|0);
    $218 = ($217|0)==($$3501$lcssa|0);
    $or$cond541 = $218 & $216;
    if ($or$cond541) {
     $$4492 = $210;$$4518 = $$1515;$$8 = $$3484$lcssa;
    } else {
     $219 = (($214>>>0) / ($$1531$lcssa>>>0))&-1;
     $220 = $219 & 1;
     $221 = ($220|0)==(0);
     $$542 = $221 ? 9007199254740992.0 : 9007199254740994.0;
     $222 = (($$1531$lcssa|0) / 2)&-1;
     $223 = ($215>>>0)<($222>>>0);
     $224 = ($215|0)==($222|0);
     $or$cond544 = $218 & $224;
     $$559 = $or$cond544 ? 1.0 : 1.5;
     $$$559 = $223 ? 0.5 : $$559;
     $225 = ($$0520|0)==(0);
     if ($225) {
      $$1467 = $$$559;$$1469 = $$542;
     } else {
      $226 = HEAP8[$$0521>>0]|0;
      $227 = ($226<<24>>24)==(45);
      $228 = -$$542;
      $229 = -$$$559;
      $$$542 = $227 ? $228 : $$542;
      $$$$559 = $227 ? $229 : $$$559;
      $$1467 = $$$$559;$$1469 = $$$542;
     }
     $230 = (($214) - ($215))|0;
     HEAP32[$210>>2] = $230;
     $231 = $$1469 + $$1467;
     $232 = $231 != $$1469;
     if ($232) {
      $233 = (($230) + ($$1531$lcssa))|0;
      HEAP32[$210>>2] = $233;
      $234 = ($233>>>0)>(999999999);
      if ($234) {
       $$5486623 = $$3484$lcssa;$$sink545622 = $210;
       while(1) {
        $235 = ((($$sink545622)) + -4|0);
        HEAP32[$$sink545622>>2] = 0;
        $236 = ($235>>>0)<($$5486623>>>0);
        if ($236) {
         $237 = ((($$5486623)) + -4|0);
         HEAP32[$237>>2] = 0;
         $$6 = $237;
        } else {
         $$6 = $$5486623;
        }
        $238 = HEAP32[$235>>2]|0;
        $239 = (($238) + 1)|0;
        HEAP32[$235>>2] = $239;
        $240 = ($239>>>0)>(999999999);
        if ($240) {
         $$5486623 = $$6;$$sink545622 = $235;
        } else {
         $$5486$lcssa = $$6;$$sink545$lcssa = $235;
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa;$$sink545$lcssa = $210;
      }
      $241 = $$5486$lcssa;
      $242 = (($183) - ($241))|0;
      $243 = $242 >> 2;
      $244 = ($243*9)|0;
      $245 = HEAP32[$$5486$lcssa>>2]|0;
      $246 = ($245>>>0)<(10);
      if ($246) {
       $$4492 = $$sink545$lcssa;$$4518 = $244;$$8 = $$5486$lcssa;
      } else {
       $$2516618 = $244;$$2532617 = 10;
       while(1) {
        $247 = ($$2532617*10)|0;
        $248 = (($$2516618) + 1)|0;
        $249 = ($245>>>0)<($247>>>0);
        if ($249) {
         $$4492 = $$sink545$lcssa;$$4518 = $248;$$8 = $$5486$lcssa;
         break;
        } else {
         $$2516618 = $248;$$2532617 = $247;
        }
       }
      }
     } else {
      $$4492 = $210;$$4518 = $$1515;$$8 = $$3484$lcssa;
     }
    }
    $250 = ((($$4492)) + 4|0);
    $251 = ($$3501$lcssa>>>0)>($250>>>0);
    $$$3501 = $251 ? $250 : $$3501$lcssa;
    $$5519$ph = $$4518;$$7505$ph = $$$3501;$$9$ph = $$8;
   } else {
    $$5519$ph = $$1515;$$7505$ph = $$3501$lcssa;$$9$ph = $$3484$lcssa;
   }
   $$7505 = $$7505$ph;
   while(1) {
    $252 = ($$7505>>>0)>($$9$ph>>>0);
    if (!($252)) {
     $$lcssa673 = 0;
     break;
    }
    $253 = ((($$7505)) + -4|0);
    $254 = HEAP32[$253>>2]|0;
    $255 = ($254|0)==(0);
    if ($255) {
     $$7505 = $253;
    } else {
     $$lcssa673 = 1;
     break;
    }
   }
   $256 = (0 - ($$5519$ph))|0;
   do {
    if ($196) {
     $not$ = $197 ^ 1;
     $257 = $not$&1;
     $$539$ = (($257) + ($$539))|0;
     $258 = ($$539$|0)>($$5519$ph|0);
     $259 = ($$5519$ph|0)>(-5);
     $or$cond6 = $258 & $259;
     if ($or$cond6) {
      $260 = (($5) + -1)|0;
      $$neg567 = (($$539$) + -1)|0;
      $261 = (($$neg567) - ($$5519$ph))|0;
      $$0479 = $260;$$2476 = $261;
     } else {
      $262 = (($5) + -2)|0;
      $263 = (($$539$) + -1)|0;
      $$0479 = $262;$$2476 = $263;
     }
     $264 = $4 & 8;
     $265 = ($264|0)==(0);
     if ($265) {
      if ($$lcssa673) {
       $266 = ((($$7505)) + -4|0);
       $267 = HEAP32[$266>>2]|0;
       $268 = ($267|0)==(0);
       if ($268) {
        $$2529 = 9;
       } else {
        $269 = (($267>>>0) % 10)&-1;
        $270 = ($269|0)==(0);
        if ($270) {
         $$1528614 = 0;$$3533613 = 10;
         while(1) {
          $271 = ($$3533613*10)|0;
          $272 = (($$1528614) + 1)|0;
          $273 = (($267>>>0) % ($271>>>0))&-1;
          $274 = ($273|0)==(0);
          if ($274) {
           $$1528614 = $272;$$3533613 = $271;
          } else {
           $$2529 = $272;
           break;
          }
         }
        } else {
         $$2529 = 0;
        }
       }
      } else {
       $$2529 = 9;
      }
      $275 = $$0479 | 32;
      $276 = ($275|0)==(102);
      $277 = $$7505;
      $278 = (($277) - ($183))|0;
      $279 = $278 >> 2;
      $280 = ($279*9)|0;
      $281 = (($280) + -9)|0;
      if ($276) {
       $282 = (($281) - ($$2529))|0;
       $283 = ($282|0)>(0);
       $$546 = $283 ? $282 : 0;
       $284 = ($$2476|0)<($$546|0);
       $$2476$$547 = $284 ? $$2476 : $$546;
       $$1480 = $$0479;$$3477 = $$2476$$547;$$pre$phi690Z2D = 0;
       break;
      } else {
       $285 = (($281) + ($$5519$ph))|0;
       $286 = (($285) - ($$2529))|0;
       $287 = ($286|0)>(0);
       $$548 = $287 ? $286 : 0;
       $288 = ($$2476|0)<($$548|0);
       $$2476$$549 = $288 ? $$2476 : $$548;
       $$1480 = $$0479;$$3477 = $$2476$$549;$$pre$phi690Z2D = 0;
       break;
      }
     } else {
      $$1480 = $$0479;$$3477 = $$2476;$$pre$phi690Z2D = $264;
     }
    } else {
     $$pre689 = $4 & 8;
     $$1480 = $5;$$3477 = $$539;$$pre$phi690Z2D = $$pre689;
    }
   } while(0);
   $289 = $$3477 | $$pre$phi690Z2D;
   $290 = ($289|0)!=(0);
   $291 = $290&1;
   $292 = $$1480 | 32;
   $293 = ($292|0)==(102);
   if ($293) {
    $294 = ($$5519$ph|0)>(0);
    $295 = $294 ? $$5519$ph : 0;
    $$2513 = 0;$$pn566 = $295;
   } else {
    $296 = ($$5519$ph|0)<(0);
    $297 = $296 ? $256 : $$5519$ph;
    $298 = ($297|0)<(0);
    $299 = $298 << 31 >> 31;
    $300 = (_fmt_u($297,$299,$11)|0);
    $301 = $11;
    $302 = $300;
    $303 = (($301) - ($302))|0;
    $304 = ($303|0)<(2);
    if ($304) {
     $$1512607 = $300;
     while(1) {
      $305 = ((($$1512607)) + -1|0);
      HEAP8[$305>>0] = 48;
      $306 = $305;
      $307 = (($301) - ($306))|0;
      $308 = ($307|0)<(2);
      if ($308) {
       $$1512607 = $305;
      } else {
       $$1512$lcssa = $305;
       break;
      }
     }
    } else {
     $$1512$lcssa = $300;
    }
    $309 = $$5519$ph >> 31;
    $310 = $309 & 2;
    $311 = (($310) + 43)|0;
    $312 = $311&255;
    $313 = ((($$1512$lcssa)) + -1|0);
    HEAP8[$313>>0] = $312;
    $314 = $$1480&255;
    $315 = ((($$1512$lcssa)) + -2|0);
    HEAP8[$315>>0] = $314;
    $316 = $315;
    $317 = (($301) - ($316))|0;
    $$2513 = $315;$$pn566 = $317;
   }
   $318 = (($$0520) + 1)|0;
   $319 = (($318) + ($$3477))|0;
   $$1526 = (($319) + ($291))|0;
   $320 = (($$1526) + ($$pn566))|0;
   _pad_506($0,32,$2,$320,$4);
   _out_500($0,$$0521,$$0520);
   $321 = $4 ^ 65536;
   _pad_506($0,48,$2,$320,$321);
   if ($293) {
    $322 = ($$9$ph>>>0)>($$556>>>0);
    $$0496$$9 = $322 ? $$556 : $$9$ph;
    $323 = ((($8)) + 9|0);
    $324 = $323;
    $325 = ((($8)) + 8|0);
    $$5493597 = $$0496$$9;
    while(1) {
     $326 = HEAP32[$$5493597>>2]|0;
     $327 = (_fmt_u($326,0,$323)|0);
     $328 = ($$5493597|0)==($$0496$$9|0);
     if ($328) {
      $334 = ($327|0)==($323|0);
      if ($334) {
       HEAP8[$325>>0] = 48;
       $$1465 = $325;
      } else {
       $$1465 = $327;
      }
     } else {
      $329 = ($327>>>0)>($8>>>0);
      if ($329) {
       $330 = $327;
       $331 = (($330) - ($9))|0;
       _memset(($8|0),48,($331|0))|0;
       $$0464594 = $327;
       while(1) {
        $332 = ((($$0464594)) + -1|0);
        $333 = ($332>>>0)>($8>>>0);
        if ($333) {
         $$0464594 = $332;
        } else {
         $$1465 = $332;
         break;
        }
       }
      } else {
       $$1465 = $327;
      }
     }
     $335 = $$1465;
     $336 = (($324) - ($335))|0;
     _out_500($0,$$1465,$336);
     $337 = ((($$5493597)) + 4|0);
     $338 = ($337>>>0)>($$556>>>0);
     if ($338) {
      break;
     } else {
      $$5493597 = $337;
     }
    }
    $339 = ($289|0)==(0);
    if (!($339)) {
     _out_500($0,3984,1);
    }
    $340 = ($337>>>0)<($$7505>>>0);
    $341 = ($$3477|0)>(0);
    $342 = $340 & $341;
    if ($342) {
     $$4478590 = $$3477;$$6494589 = $337;
     while(1) {
      $343 = HEAP32[$$6494589>>2]|0;
      $344 = (_fmt_u($343,0,$323)|0);
      $345 = ($344>>>0)>($8>>>0);
      if ($345) {
       $346 = $344;
       $347 = (($346) - ($9))|0;
       _memset(($8|0),48,($347|0))|0;
       $$0463584 = $344;
       while(1) {
        $348 = ((($$0463584)) + -1|0);
        $349 = ($348>>>0)>($8>>>0);
        if ($349) {
         $$0463584 = $348;
        } else {
         $$0463$lcssa = $348;
         break;
        }
       }
      } else {
       $$0463$lcssa = $344;
      }
      $350 = ($$4478590|0)<(9);
      $351 = $350 ? $$4478590 : 9;
      _out_500($0,$$0463$lcssa,$351);
      $352 = ((($$6494589)) + 4|0);
      $353 = (($$4478590) + -9)|0;
      $354 = ($352>>>0)<($$7505>>>0);
      $355 = ($$4478590|0)>(9);
      $356 = $354 & $355;
      if ($356) {
       $$4478590 = $353;$$6494589 = $352;
      } else {
       $$4478$lcssa = $353;
       break;
      }
     }
    } else {
     $$4478$lcssa = $$3477;
    }
    $357 = (($$4478$lcssa) + 9)|0;
    _pad_506($0,48,$357,9,0);
   } else {
    $358 = ((($$9$ph)) + 4|0);
    $$7505$ = $$lcssa673 ? $$7505 : $358;
    $359 = ($$3477|0)>(-1);
    if ($359) {
     $360 = ((($8)) + 9|0);
     $361 = ($$pre$phi690Z2D|0)==(0);
     $362 = $360;
     $363 = (0 - ($9))|0;
     $364 = ((($8)) + 8|0);
     $$5602 = $$3477;$$7495601 = $$9$ph;
     while(1) {
      $365 = HEAP32[$$7495601>>2]|0;
      $366 = (_fmt_u($365,0,$360)|0);
      $367 = ($366|0)==($360|0);
      if ($367) {
       HEAP8[$364>>0] = 48;
       $$0 = $364;
      } else {
       $$0 = $366;
      }
      $368 = ($$7495601|0)==($$9$ph|0);
      do {
       if ($368) {
        $372 = ((($$0)) + 1|0);
        _out_500($0,$$0,1);
        $373 = ($$5602|0)<(1);
        $or$cond554 = $361 & $373;
        if ($or$cond554) {
         $$2 = $372;
         break;
        }
        _out_500($0,3984,1);
        $$2 = $372;
       } else {
        $369 = ($$0>>>0)>($8>>>0);
        if (!($369)) {
         $$2 = $$0;
         break;
        }
        $scevgep684 = (($$0) + ($363)|0);
        $scevgep684685 = $scevgep684;
        _memset(($8|0),48,($scevgep684685|0))|0;
        $$1598 = $$0;
        while(1) {
         $370 = ((($$1598)) + -1|0);
         $371 = ($370>>>0)>($8>>>0);
         if ($371) {
          $$1598 = $370;
         } else {
          $$2 = $370;
          break;
         }
        }
       }
      } while(0);
      $374 = $$2;
      $375 = (($362) - ($374))|0;
      $376 = ($$5602|0)>($375|0);
      $377 = $376 ? $375 : $$5602;
      _out_500($0,$$2,$377);
      $378 = (($$5602) - ($375))|0;
      $379 = ((($$7495601)) + 4|0);
      $380 = ($379>>>0)<($$7505$>>>0);
      $381 = ($378|0)>(-1);
      $382 = $380 & $381;
      if ($382) {
       $$5602 = $378;$$7495601 = $379;
      } else {
       $$5$lcssa = $378;
       break;
      }
     }
    } else {
     $$5$lcssa = $$3477;
    }
    $383 = (($$5$lcssa) + 18)|0;
    _pad_506($0,48,$383,18,0);
    $384 = $11;
    $385 = $$2513;
    $386 = (($384) - ($385))|0;
    _out_500($0,$$2513,$386);
   }
   $387 = $4 ^ 8192;
   _pad_506($0,32,$2,$320,$387);
   $$sink562 = $320;
  } else {
   $27 = $5 & 32;
   $28 = ($27|0)!=(0);
   $29 = $28 ? 3952 : 3956;
   $30 = ($$0471 != $$0471) | (0.0 != 0.0);
   $31 = $28 ? 3960 : 3964;
   $$0510 = $30 ? $31 : $29;
   $32 = (($$0520) + 3)|0;
   $33 = $4 & -65537;
   _pad_506($0,32,$2,$32,$33);
   _out_500($0,$$0521,$$0520);
   _out_500($0,$$0510,3);
   $34 = $4 ^ 8192;
   _pad_506($0,32,$2,$32,$34);
   $$sink562 = $32;
  }
 } while(0);
 $388 = ($$sink562|0)<($2|0);
 $$555 = $388 ? $2 : $$sink562;
 STACKTOP = sp;return ($$555|0);
}
function ___DOUBLE_BITS_507($0) {
 $0 = +$0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $0;$1 = HEAP32[tempDoublePtr>>2]|0;
 $2 = HEAP32[tempDoublePtr+4>>2]|0;
 tempRet0 = ($2);
 return ($1|0);
}
function _frexpl($0,$1) {
 $0 = +$0;
 $1 = $1|0;
 var $2 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (+_frexp($0,$1));
 return (+$2);
}
function _frexp($0,$1) {
 $0 = +$0;
 $1 = $1|0;
 var $$0 = 0.0, $$016 = 0.0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0.0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0.0, $9 = 0.0, $storemerge = 0, $trunc$clear = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $0;$2 = HEAP32[tempDoublePtr>>2]|0;
 $3 = HEAP32[tempDoublePtr+4>>2]|0;
 $4 = (_bitshift64Lshr(($2|0),($3|0),52)|0);
 $5 = tempRet0;
 $6 = $4&65535;
 $trunc$clear = $6 & 2047;
 switch ($trunc$clear<<16>>16) {
 case 0:  {
  $7 = $0 != 0.0;
  if ($7) {
   $8 = $0 * 1.8446744073709552E+19;
   $9 = (+_frexp($8,$1));
   $10 = HEAP32[$1>>2]|0;
   $11 = (($10) + -64)|0;
   $$016 = $9;$storemerge = $11;
  } else {
   $$016 = $0;$storemerge = 0;
  }
  HEAP32[$1>>2] = $storemerge;
  $$0 = $$016;
  break;
 }
 case 2047:  {
  $$0 = $0;
  break;
 }
 default: {
  $12 = $4 & 2047;
  $13 = (($12) + -1022)|0;
  HEAP32[$1>>2] = $13;
  $14 = $3 & -2146435073;
  $15 = $14 | 1071644672;
  HEAP32[tempDoublePtr>>2] = $2;HEAP32[tempDoublePtr+4>>2] = $15;$16 = +HEAPF64[tempDoublePtr>>3];
  $$0 = $16;
 }
 }
 return (+$$0);
}
function _wcrtomb($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $not$ = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($0|0)==(0|0);
 do {
  if ($3) {
   $$0 = 1;
  } else {
   $4 = ($1>>>0)<(128);
   if ($4) {
    $5 = $1&255;
    HEAP8[$0>>0] = $5;
    $$0 = 1;
    break;
   }
   $6 = (___pthread_self_815()|0);
   $7 = ((($6)) + 188|0);
   $8 = HEAP32[$7>>2]|0;
   $9 = HEAP32[$8>>2]|0;
   $not$ = ($9|0)==(0|0);
   if ($not$) {
    $10 = $1 & -128;
    $11 = ($10|0)==(57216);
    if ($11) {
     $13 = $1&255;
     HEAP8[$0>>0] = $13;
     $$0 = 1;
     break;
    } else {
     $12 = (___errno_location()|0);
     HEAP32[$12>>2] = 84;
     $$0 = -1;
     break;
    }
   }
   $14 = ($1>>>0)<(2048);
   if ($14) {
    $15 = $1 >>> 6;
    $16 = $15 | 192;
    $17 = $16&255;
    $18 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $17;
    $19 = $1 & 63;
    $20 = $19 | 128;
    $21 = $20&255;
    HEAP8[$18>>0] = $21;
    $$0 = 2;
    break;
   }
   $22 = ($1>>>0)<(55296);
   $23 = $1 & -8192;
   $24 = ($23|0)==(57344);
   $or$cond = $22 | $24;
   if ($or$cond) {
    $25 = $1 >>> 12;
    $26 = $25 | 224;
    $27 = $26&255;
    $28 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $27;
    $29 = $1 >>> 6;
    $30 = $29 & 63;
    $31 = $30 | 128;
    $32 = $31&255;
    $33 = ((($0)) + 2|0);
    HEAP8[$28>>0] = $32;
    $34 = $1 & 63;
    $35 = $34 | 128;
    $36 = $35&255;
    HEAP8[$33>>0] = $36;
    $$0 = 3;
    break;
   }
   $37 = (($1) + -65536)|0;
   $38 = ($37>>>0)<(1048576);
   if ($38) {
    $39 = $1 >>> 18;
    $40 = $39 | 240;
    $41 = $40&255;
    $42 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $41;
    $43 = $1 >>> 12;
    $44 = $43 & 63;
    $45 = $44 | 128;
    $46 = $45&255;
    $47 = ((($0)) + 2|0);
    HEAP8[$42>>0] = $46;
    $48 = $1 >>> 6;
    $49 = $48 & 63;
    $50 = $49 | 128;
    $51 = $50&255;
    $52 = ((($0)) + 3|0);
    HEAP8[$47>>0] = $51;
    $53 = $1 & 63;
    $54 = $53 | 128;
    $55 = $54&255;
    HEAP8[$52>>0] = $55;
    $$0 = 4;
    break;
   } else {
    $56 = (___errno_location()|0);
    HEAP32[$56>>2] = 84;
    $$0 = -1;
    break;
   }
  }
 } while(0);
 return ($$0|0);
}
function ___pthread_self_815() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (_pthread_self()|0);
 return ($0|0);
}
function ___pthread_self_705() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (_pthread_self()|0);
 return ($0|0);
}
function ___strerror_l($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $$016 = 0;
 while(1) {
  $3 = (3986 + ($$016)|0);
  $4 = HEAP8[$3>>0]|0;
  $5 = $4&255;
  $6 = ($5|0)==($0|0);
  if ($6) {
   label = 2;
   break;
  }
  $7 = (($$016) + 1)|0;
  $8 = ($7|0)==(87);
  if ($8) {
   $$01214 = 4074;$$115 = 87;
   label = 5;
   break;
  } else {
   $$016 = $7;
  }
 }
 if ((label|0) == 2) {
  $2 = ($$016|0)==(0);
  if ($2) {
   $$012$lcssa = 4074;
  } else {
   $$01214 = 4074;$$115 = $$016;
   label = 5;
  }
 }
 if ((label|0) == 5) {
  while(1) {
   label = 0;
   $$113 = $$01214;
   while(1) {
    $9 = HEAP8[$$113>>0]|0;
    $10 = ($9<<24>>24)==(0);
    $11 = ((($$113)) + 1|0);
    if ($10) {
     break;
    } else {
     $$113 = $11;
    }
   }
   $12 = (($$115) + -1)|0;
   $13 = ($12|0)==(0);
   if ($13) {
    $$012$lcssa = $11;
    break;
   } else {
    $$01214 = $11;$$115 = $12;
    label = 5;
   }
  }
 }
 $14 = ((($1)) + 20|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = (___lctrans($$012$lcssa,$15)|0);
 return ($16|0);
}
function ___lctrans($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (___lctrans_impl($0,$1)|0);
 return ($2|0);
}
function ___fwritex($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$038 = 0, $$042 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $$pre = 0, $$pre47 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0;
 var $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ((($2)) + 16|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==(0|0);
 if ($5) {
  $7 = (___towrite($2)|0);
  $8 = ($7|0)==(0);
  if ($8) {
   $$pre = HEAP32[$3>>2]|0;
   $12 = $$pre;
   label = 5;
  } else {
   $$1 = 0;
  }
 } else {
  $6 = $4;
  $12 = $6;
  label = 5;
 }
 L5: do {
  if ((label|0) == 5) {
   $9 = ((($2)) + 20|0);
   $10 = HEAP32[$9>>2]|0;
   $11 = (($12) - ($10))|0;
   $13 = ($11>>>0)<($1>>>0);
   $14 = $10;
   if ($13) {
    $15 = ((($2)) + 36|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = (FUNCTION_TABLE_iiii[$16 & 127]($2,$0,$1)|0);
    $$1 = $17;
    break;
   }
   $18 = ((($2)) + 75|0);
   $19 = HEAP8[$18>>0]|0;
   $20 = ($19<<24>>24)>(-1);
   L10: do {
    if ($20) {
     $$038 = $1;
     while(1) {
      $21 = ($$038|0)==(0);
      if ($21) {
       $$139 = 0;$$141 = $0;$$143 = $1;$31 = $14;
       break L10;
      }
      $22 = (($$038) + -1)|0;
      $23 = (($0) + ($22)|0);
      $24 = HEAP8[$23>>0]|0;
      $25 = ($24<<24>>24)==(10);
      if ($25) {
       break;
      } else {
       $$038 = $22;
      }
     }
     $26 = ((($2)) + 36|0);
     $27 = HEAP32[$26>>2]|0;
     $28 = (FUNCTION_TABLE_iiii[$27 & 127]($2,$0,$$038)|0);
     $29 = ($28>>>0)<($$038>>>0);
     if ($29) {
      $$1 = $28;
      break L5;
     }
     $30 = (($0) + ($$038)|0);
     $$042 = (($1) - ($$038))|0;
     $$pre47 = HEAP32[$9>>2]|0;
     $$139 = $$038;$$141 = $30;$$143 = $$042;$31 = $$pre47;
    } else {
     $$139 = 0;$$141 = $0;$$143 = $1;$31 = $14;
    }
   } while(0);
   _memcpy(($31|0),($$141|0),($$143|0))|0;
   $32 = HEAP32[$9>>2]|0;
   $33 = (($32) + ($$143)|0);
   HEAP32[$9>>2] = $33;
   $34 = (($$139) + ($$143))|0;
   $$1 = $34;
  }
 } while(0);
 return ($$1|0);
}
function ___towrite($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 74|0);
 $2 = HEAP8[$1>>0]|0;
 $3 = $2 << 24 >> 24;
 $4 = (($3) + 255)|0;
 $5 = $4 | $3;
 $6 = $5&255;
 HEAP8[$1>>0] = $6;
 $7 = HEAP32[$0>>2]|0;
 $8 = $7 & 8;
 $9 = ($8|0)==(0);
 if ($9) {
  $11 = ((($0)) + 8|0);
  HEAP32[$11>>2] = 0;
  $12 = ((($0)) + 4|0);
  HEAP32[$12>>2] = 0;
  $13 = ((($0)) + 44|0);
  $14 = HEAP32[$13>>2]|0;
  $15 = ((($0)) + 28|0);
  HEAP32[$15>>2] = $14;
  $16 = ((($0)) + 20|0);
  HEAP32[$16>>2] = $14;
  $17 = ((($0)) + 48|0);
  $18 = HEAP32[$17>>2]|0;
  $19 = (($14) + ($18)|0);
  $20 = ((($0)) + 16|0);
  HEAP32[$20>>2] = $19;
  $$0 = 0;
 } else {
  $10 = $7 | 32;
  HEAP32[$0>>2] = $10;
  $$0 = -1;
 }
 return ($$0|0);
}
function _memcmp($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$01318 = 0, $$01417 = 0, $$019 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($2|0)==(0);
 L1: do {
  if ($3) {
   $14 = 0;
  } else {
   $$01318 = $0;$$01417 = $2;$$019 = $1;
   while(1) {
    $4 = HEAP8[$$01318>>0]|0;
    $5 = HEAP8[$$019>>0]|0;
    $6 = ($4<<24>>24)==($5<<24>>24);
    if (!($6)) {
     break;
    }
    $7 = (($$01417) + -1)|0;
    $8 = ((($$01318)) + 1|0);
    $9 = ((($$019)) + 1|0);
    $10 = ($7|0)==(0);
    if ($10) {
     $14 = 0;
     break L1;
    } else {
     $$01318 = $8;$$01417 = $7;$$019 = $9;
    }
   }
   $11 = $4&255;
   $12 = $5&255;
   $13 = (($11) - ($12))|0;
   $14 = $13;
  }
 } while(0);
 return ($14|0);
}
function ___ofl_lock() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___lock((6844|0));
 return (6852|0);
}
function ___ofl_unlock() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___unlock((6844|0));
 return;
}
function _fflush($0) {
 $0 = $0|0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 do {
  if ($1) {
   $8 = HEAP32[312]|0;
   $9 = ($8|0)==(0|0);
   if ($9) {
    $29 = 0;
   } else {
    $10 = HEAP32[312]|0;
    $11 = (_fflush($10)|0);
    $29 = $11;
   }
   $12 = (___ofl_lock()|0);
   $$02325 = HEAP32[$12>>2]|0;
   $13 = ($$02325|0)==(0|0);
   if ($13) {
    $$024$lcssa = $29;
   } else {
    $$02327 = $$02325;$$02426 = $29;
    while(1) {
     $14 = ((($$02327)) + 76|0);
     $15 = HEAP32[$14>>2]|0;
     $16 = ($15|0)>(-1);
     if ($16) {
      $17 = (___lockfile($$02327)|0);
      $25 = $17;
     } else {
      $25 = 0;
     }
     $18 = ((($$02327)) + 20|0);
     $19 = HEAP32[$18>>2]|0;
     $20 = ((($$02327)) + 28|0);
     $21 = HEAP32[$20>>2]|0;
     $22 = ($19>>>0)>($21>>>0);
     if ($22) {
      $23 = (___fflush_unlocked($$02327)|0);
      $24 = $23 | $$02426;
      $$1 = $24;
     } else {
      $$1 = $$02426;
     }
     $26 = ($25|0)==(0);
     if (!($26)) {
      ___unlockfile($$02327);
     }
     $27 = ((($$02327)) + 56|0);
     $$023 = HEAP32[$27>>2]|0;
     $28 = ($$023|0)==(0|0);
     if ($28) {
      $$024$lcssa = $$1;
      break;
     } else {
      $$02327 = $$023;$$02426 = $$1;
     }
    }
   }
   ___ofl_unlock();
   $$0 = $$024$lcssa;
  } else {
   $2 = ((($0)) + 76|0);
   $3 = HEAP32[$2>>2]|0;
   $4 = ($3|0)>(-1);
   if (!($4)) {
    $5 = (___fflush_unlocked($0)|0);
    $$0 = $5;
    break;
   }
   $6 = (___lockfile($0)|0);
   $phitmp = ($6|0)==(0);
   $7 = (___fflush_unlocked($0)|0);
   if ($phitmp) {
    $$0 = $7;
   } else {
    ___unlockfile($0);
    $$0 = $7;
   }
  }
 } while(0);
 return ($$0|0);
}
function ___fflush_unlocked($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 20|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 28|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($2>>>0)>($4>>>0);
 if ($5) {
  $6 = ((($0)) + 36|0);
  $7 = HEAP32[$6>>2]|0;
  (FUNCTION_TABLE_iiii[$7 & 127]($0,0,0)|0);
  $8 = HEAP32[$1>>2]|0;
  $9 = ($8|0)==(0|0);
  if ($9) {
   $$0 = -1;
  } else {
   label = 3;
  }
 } else {
  label = 3;
 }
 if ((label|0) == 3) {
  $10 = ((($0)) + 4|0);
  $11 = HEAP32[$10>>2]|0;
  $12 = ((($0)) + 8|0);
  $13 = HEAP32[$12>>2]|0;
  $14 = ($11>>>0)<($13>>>0);
  if ($14) {
   $15 = $11;
   $16 = $13;
   $17 = (($15) - ($16))|0;
   $18 = ((($0)) + 40|0);
   $19 = HEAP32[$18>>2]|0;
   (FUNCTION_TABLE_iiii[$19 & 127]($0,$17,1)|0);
  }
  $20 = ((($0)) + 16|0);
  HEAP32[$20>>2] = 0;
  HEAP32[$3>>2] = 0;
  HEAP32[$1>>2] = 0;
  HEAP32[$12>>2] = 0;
  HEAP32[$10>>2] = 0;
  $$0 = 0;
 }
 return ($$0|0);
}
function ___overflow($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $$pre = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $3 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = sp;
 $3 = $1&255;
 HEAP8[$2>>0] = $3;
 $4 = ((($0)) + 16|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($5|0)==(0|0);
 if ($6) {
  $7 = (___towrite($0)|0);
  $8 = ($7|0)==(0);
  if ($8) {
   $$pre = HEAP32[$4>>2]|0;
   $12 = $$pre;
   label = 4;
  } else {
   $$0 = -1;
  }
 } else {
  $12 = $5;
  label = 4;
 }
 do {
  if ((label|0) == 4) {
   $9 = ((($0)) + 20|0);
   $10 = HEAP32[$9>>2]|0;
   $11 = ($10>>>0)<($12>>>0);
   if ($11) {
    $13 = $1 & 255;
    $14 = ((($0)) + 75|0);
    $15 = HEAP8[$14>>0]|0;
    $16 = $15 << 24 >> 24;
    $17 = ($13|0)==($16|0);
    if (!($17)) {
     $18 = ((($10)) + 1|0);
     HEAP32[$9>>2] = $18;
     HEAP8[$10>>0] = $3;
     $$0 = $13;
     break;
    }
   }
   $19 = ((($0)) + 36|0);
   $20 = HEAP32[$19>>2]|0;
   $21 = (FUNCTION_TABLE_iiii[$20 & 127]($0,$2,1)|0);
   $22 = ($21|0)==(1);
   if ($22) {
    $23 = HEAP8[$2>>0]|0;
    $24 = $23&255;
    $$0 = $24;
   } else {
    $$0 = -1;
   }
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function ___strdup($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (_strlen($0)|0);
 $2 = (($1) + 1)|0;
 $3 = (_malloc($2)|0);
 $4 = ($3|0)==(0|0);
 if ($4) {
  $$0 = 0;
 } else {
  _memcpy(($3|0),($0|0),($2|0))|0;
  $$0 = $3;
 }
 return ($$0|0);
}
function _fputc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($1)) + 76|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ($3|0)<(0);
 $5 = $0&255;
 $6 = $0 & 255;
 if ($4) {
  label = 3;
 } else {
  $7 = (___lockfile($1)|0);
  $8 = ($7|0)==(0);
  if ($8) {
   label = 3;
  } else {
   $20 = ((($1)) + 75|0);
   $21 = HEAP8[$20>>0]|0;
   $22 = $21 << 24 >> 24;
   $23 = ($6|0)==($22|0);
   if ($23) {
    label = 10;
   } else {
    $24 = ((($1)) + 20|0);
    $25 = HEAP32[$24>>2]|0;
    $26 = ((($1)) + 16|0);
    $27 = HEAP32[$26>>2]|0;
    $28 = ($25>>>0)<($27>>>0);
    if ($28) {
     $29 = ((($25)) + 1|0);
     HEAP32[$24>>2] = $29;
     HEAP8[$25>>0] = $5;
     $31 = $6;
    } else {
     label = 10;
    }
   }
   if ((label|0) == 10) {
    $30 = (___overflow($1,$0)|0);
    $31 = $30;
   }
   ___unlockfile($1);
   $$0 = $31;
  }
 }
 do {
  if ((label|0) == 3) {
   $9 = ((($1)) + 75|0);
   $10 = HEAP8[$9>>0]|0;
   $11 = $10 << 24 >> 24;
   $12 = ($6|0)==($11|0);
   if (!($12)) {
    $13 = ((($1)) + 20|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = ((($1)) + 16|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = ($14>>>0)<($16>>>0);
    if ($17) {
     $18 = ((($14)) + 1|0);
     HEAP32[$13>>2] = $18;
     HEAP8[$14>>0] = $5;
     $$0 = $6;
     break;
    }
   }
   $19 = (___overflow($1,$0)|0);
   $$0 = $19;
  }
 } while(0);
 return ($$0|0);
}
function _malloc($0) {
 $0 = $0|0;
 var $$$0192$i = 0, $$$0193$i = 0, $$$4236$i = 0, $$$4351$i = 0, $$$i = 0, $$0 = 0, $$0$i$i = 0, $$0$i$i$i = 0, $$0$i18$i = 0, $$01$i$i = 0, $$0189$i = 0, $$0192$lcssa$i = 0, $$01928$i = 0, $$0193$lcssa$i = 0, $$01937$i = 0, $$0197 = 0, $$0199 = 0, $$0206$i$i = 0, $$0207$i$i = 0, $$0211$i$i = 0;
 var $$0212$i$i = 0, $$024371$i = 0, $$0287$i$i = 0, $$0288$i$i = 0, $$0289$i$i = 0, $$0295$i$i = 0, $$0296$i$i = 0, $$0342$i = 0, $$0344$i = 0, $$0345$i = 0, $$0347$i = 0, $$0353$i = 0, $$0358$i = 0, $$0359$$i = 0, $$0359$i = 0, $$0361$i = 0, $$0362$i = 0, $$0368$i = 0, $$1196$i = 0, $$1198$i = 0;
 var $$124470$i = 0, $$1291$i$i = 0, $$1293$i$i = 0, $$1343$i = 0, $$1348$i = 0, $$1363$i = 0, $$1370$i = 0, $$1374$i = 0, $$2234253237$i = 0, $$2247$ph$i = 0, $$2253$ph$i = 0, $$2355$i = 0, $$3$i = 0, $$3$i$i = 0, $$3$i201 = 0, $$3350$i = 0, $$3372$i = 0, $$4$lcssa$i = 0, $$4$ph$i = 0, $$415$i = 0;
 var $$4236$i = 0, $$4351$lcssa$i = 0, $$435114$i = 0, $$4357$$4$i = 0, $$4357$ph$i = 0, $$435713$i = 0, $$723948$i = 0, $$749$i = 0, $$pre = 0, $$pre$i = 0, $$pre$i$i = 0, $$pre$i19$i = 0, $$pre$i210 = 0, $$pre$i212 = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i20$iZ2D = 0, $$pre$phi$i211Z2D = 0, $$pre$phi$iZ2D = 0, $$pre$phi11$i$iZ2D = 0, $$pre$phiZ2D = 0;
 var $$pre10$i$i = 0, $$sink1$i = 0, $$sink1$i$i = 0, $$sink16$i = 0, $$sink2$i = 0, $$sink2$i204 = 0, $$sink3$i = 0, $1 = 0, $10 = 0, $100 = 0, $1000 = 0, $1001 = 0, $1002 = 0, $1003 = 0, $1004 = 0, $1005 = 0, $1006 = 0, $1007 = 0, $1008 = 0, $1009 = 0;
 var $101 = 0, $1010 = 0, $1011 = 0, $1012 = 0, $1013 = 0, $1014 = 0, $1015 = 0, $1016 = 0, $1017 = 0, $1018 = 0, $1019 = 0, $102 = 0, $1020 = 0, $1021 = 0, $1022 = 0, $1023 = 0, $1024 = 0, $1025 = 0, $1026 = 0, $1027 = 0;
 var $1028 = 0, $1029 = 0, $103 = 0, $1030 = 0, $1031 = 0, $1032 = 0, $1033 = 0, $1034 = 0, $1035 = 0, $1036 = 0, $1037 = 0, $1038 = 0, $1039 = 0, $104 = 0, $1040 = 0, $1041 = 0, $1042 = 0, $1043 = 0, $1044 = 0, $1045 = 0;
 var $1046 = 0, $1047 = 0, $1048 = 0, $1049 = 0, $105 = 0, $1050 = 0, $1051 = 0, $1052 = 0, $1053 = 0, $1054 = 0, $1055 = 0, $1056 = 0, $1057 = 0, $1058 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0;
 var $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0;
 var $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0;
 var $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0;
 var $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0;
 var $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0;
 var $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0;
 var $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0;
 var $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0;
 var $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0;
 var $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0;
 var $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0;
 var $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0;
 var $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0;
 var $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0;
 var $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0;
 var $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0;
 var $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0;
 var $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0;
 var $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0;
 var $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0;
 var $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0;
 var $490 = 0, $491 = 0, $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0;
 var $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0;
 var $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0;
 var $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0, $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0;
 var $562 = 0, $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0, $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0;
 var $580 = 0, $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0, $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0;
 var $599 = 0, $6 = 0, $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0, $605 = 0, $606 = 0, $607 = 0, $608 = 0, $609 = 0, $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0;
 var $616 = 0, $617 = 0, $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0, $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0, $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0;
 var $634 = 0, $635 = 0, $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0, $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0, $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0;
 var $652 = 0, $653 = 0, $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0, $66 = 0, $660 = 0, $661 = 0, $662 = 0, $663 = 0, $664 = 0, $665 = 0, $666 = 0, $667 = 0, $668 = 0, $669 = 0, $67 = 0;
 var $670 = 0, $671 = 0, $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0, $678 = 0, $679 = 0, $68 = 0, $680 = 0, $681 = 0, $682 = 0, $683 = 0, $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0;
 var $689 = 0, $69 = 0, $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0, $696 = 0, $697 = 0, $698 = 0, $699 = 0, $7 = 0, $70 = 0, $700 = 0, $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0;
 var $706 = 0, $707 = 0, $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0, $713 = 0, $714 = 0, $715 = 0, $716 = 0, $717 = 0, $718 = 0, $719 = 0, $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0;
 var $724 = 0, $725 = 0, $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0, $730 = 0, $731 = 0, $732 = 0, $733 = 0, $734 = 0, $735 = 0, $736 = 0, $737 = 0, $738 = 0, $739 = 0, $74 = 0, $740 = 0, $741 = 0;
 var $742 = 0, $743 = 0, $744 = 0, $745 = 0, $746 = 0, $747 = 0, $748 = 0, $749 = 0, $75 = 0, $750 = 0, $751 = 0, $752 = 0, $753 = 0, $754 = 0, $755 = 0, $756 = 0, $757 = 0, $758 = 0, $759 = 0, $76 = 0;
 var $760 = 0, $761 = 0, $762 = 0, $763 = 0, $764 = 0, $765 = 0, $766 = 0, $767 = 0, $768 = 0, $769 = 0, $77 = 0, $770 = 0, $771 = 0, $772 = 0, $773 = 0, $774 = 0, $775 = 0, $776 = 0, $777 = 0, $778 = 0;
 var $779 = 0, $78 = 0, $780 = 0, $781 = 0, $782 = 0, $783 = 0, $784 = 0, $785 = 0, $786 = 0, $787 = 0, $788 = 0, $789 = 0, $79 = 0, $790 = 0, $791 = 0, $792 = 0, $793 = 0, $794 = 0, $795 = 0, $796 = 0;
 var $797 = 0, $798 = 0, $799 = 0, $8 = 0, $80 = 0, $800 = 0, $801 = 0, $802 = 0, $803 = 0, $804 = 0, $805 = 0, $806 = 0, $807 = 0, $808 = 0, $809 = 0, $81 = 0, $810 = 0, $811 = 0, $812 = 0, $813 = 0;
 var $814 = 0, $815 = 0, $816 = 0, $817 = 0, $818 = 0, $819 = 0, $82 = 0, $820 = 0, $821 = 0, $822 = 0, $823 = 0, $824 = 0, $825 = 0, $826 = 0, $827 = 0, $828 = 0, $829 = 0, $83 = 0, $830 = 0, $831 = 0;
 var $832 = 0, $833 = 0, $834 = 0, $835 = 0, $836 = 0, $837 = 0, $838 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $842 = 0, $843 = 0, $844 = 0, $845 = 0, $846 = 0, $847 = 0, $848 = 0, $849 = 0, $85 = 0;
 var $850 = 0, $851 = 0, $852 = 0, $853 = 0, $854 = 0, $855 = 0, $856 = 0, $857 = 0, $858 = 0, $859 = 0, $86 = 0, $860 = 0, $861 = 0, $862 = 0, $863 = 0, $864 = 0, $865 = 0, $866 = 0, $867 = 0, $868 = 0;
 var $869 = 0, $87 = 0, $870 = 0, $871 = 0, $872 = 0, $873 = 0, $874 = 0, $875 = 0, $876 = 0, $877 = 0, $878 = 0, $879 = 0, $88 = 0, $880 = 0, $881 = 0, $882 = 0, $883 = 0, $884 = 0, $885 = 0, $886 = 0;
 var $887 = 0, $888 = 0, $889 = 0, $89 = 0, $890 = 0, $891 = 0, $892 = 0, $893 = 0, $894 = 0, $895 = 0, $896 = 0, $897 = 0, $898 = 0, $899 = 0, $9 = 0, $90 = 0, $900 = 0, $901 = 0, $902 = 0, $903 = 0;
 var $904 = 0, $905 = 0, $906 = 0, $907 = 0, $908 = 0, $909 = 0, $91 = 0, $910 = 0, $911 = 0, $912 = 0, $913 = 0, $914 = 0, $915 = 0, $916 = 0, $917 = 0, $918 = 0, $919 = 0, $92 = 0, $920 = 0, $921 = 0;
 var $922 = 0, $923 = 0, $924 = 0, $925 = 0, $926 = 0, $927 = 0, $928 = 0, $929 = 0, $93 = 0, $930 = 0, $931 = 0, $932 = 0, $933 = 0, $934 = 0, $935 = 0, $936 = 0, $937 = 0, $938 = 0, $939 = 0, $94 = 0;
 var $940 = 0, $941 = 0, $942 = 0, $943 = 0, $944 = 0, $945 = 0, $946 = 0, $947 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $951 = 0, $952 = 0, $953 = 0, $954 = 0, $955 = 0, $956 = 0, $957 = 0, $958 = 0;
 var $959 = 0, $96 = 0, $960 = 0, $961 = 0, $962 = 0, $963 = 0, $964 = 0, $965 = 0, $966 = 0, $967 = 0, $968 = 0, $969 = 0, $97 = 0, $970 = 0, $971 = 0, $972 = 0, $973 = 0, $974 = 0, $975 = 0, $976 = 0;
 var $977 = 0, $978 = 0, $979 = 0, $98 = 0, $980 = 0, $981 = 0, $982 = 0, $983 = 0, $984 = 0, $985 = 0, $986 = 0, $987 = 0, $988 = 0, $989 = 0, $99 = 0, $990 = 0, $991 = 0, $992 = 0, $993 = 0, $994 = 0;
 var $995 = 0, $996 = 0, $997 = 0, $998 = 0, $999 = 0, $cond$i = 0, $cond$i$i = 0, $cond$i208 = 0, $exitcond$i$i = 0, $not$$i = 0, $not$$i$i = 0, $not$$i17$i = 0, $not$$i209 = 0, $not$$i216 = 0, $not$1$i = 0, $not$1$i203 = 0, $not$5$i = 0, $not$7$i$i = 0, $not$8$i = 0, $not$9$i = 0;
 var $or$cond$i = 0, $or$cond$i214 = 0, $or$cond1$i = 0, $or$cond10$i = 0, $or$cond11$i = 0, $or$cond11$not$i = 0, $or$cond12$i = 0, $or$cond2$i = 0, $or$cond2$i215 = 0, $or$cond5$i = 0, $or$cond50$i = 0, $or$cond51$i = 0, $or$cond7$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp;
 $2 = ($0>>>0)<(245);
 do {
  if ($2) {
   $3 = ($0>>>0)<(11);
   $4 = (($0) + 11)|0;
   $5 = $4 & -8;
   $6 = $3 ? 16 : $5;
   $7 = $6 >>> 3;
   $8 = HEAP32[1714]|0;
   $9 = $8 >>> $7;
   $10 = $9 & 3;
   $11 = ($10|0)==(0);
   if (!($11)) {
    $12 = $9 & 1;
    $13 = $12 ^ 1;
    $14 = (($13) + ($7))|0;
    $15 = $14 << 1;
    $16 = (6896 + ($15<<2)|0);
    $17 = ((($16)) + 8|0);
    $18 = HEAP32[$17>>2]|0;
    $19 = ((($18)) + 8|0);
    $20 = HEAP32[$19>>2]|0;
    $21 = ($16|0)==($20|0);
    do {
     if ($21) {
      $22 = 1 << $14;
      $23 = $22 ^ -1;
      $24 = $8 & $23;
      HEAP32[1714] = $24;
     } else {
      $25 = HEAP32[(6872)>>2]|0;
      $26 = ($20>>>0)<($25>>>0);
      if ($26) {
       _abort();
       // unreachable;
      }
      $27 = ((($20)) + 12|0);
      $28 = HEAP32[$27>>2]|0;
      $29 = ($28|0)==($18|0);
      if ($29) {
       HEAP32[$27>>2] = $16;
       HEAP32[$17>>2] = $20;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $30 = $14 << 3;
    $31 = $30 | 3;
    $32 = ((($18)) + 4|0);
    HEAP32[$32>>2] = $31;
    $33 = (($18) + ($30)|0);
    $34 = ((($33)) + 4|0);
    $35 = HEAP32[$34>>2]|0;
    $36 = $35 | 1;
    HEAP32[$34>>2] = $36;
    $$0 = $19;
    STACKTOP = sp;return ($$0|0);
   }
   $37 = HEAP32[(6864)>>2]|0;
   $38 = ($6>>>0)>($37>>>0);
   if ($38) {
    $39 = ($9|0)==(0);
    if (!($39)) {
     $40 = $9 << $7;
     $41 = 2 << $7;
     $42 = (0 - ($41))|0;
     $43 = $41 | $42;
     $44 = $40 & $43;
     $45 = (0 - ($44))|0;
     $46 = $44 & $45;
     $47 = (($46) + -1)|0;
     $48 = $47 >>> 12;
     $49 = $48 & 16;
     $50 = $47 >>> $49;
     $51 = $50 >>> 5;
     $52 = $51 & 8;
     $53 = $52 | $49;
     $54 = $50 >>> $52;
     $55 = $54 >>> 2;
     $56 = $55 & 4;
     $57 = $53 | $56;
     $58 = $54 >>> $56;
     $59 = $58 >>> 1;
     $60 = $59 & 2;
     $61 = $57 | $60;
     $62 = $58 >>> $60;
     $63 = $62 >>> 1;
     $64 = $63 & 1;
     $65 = $61 | $64;
     $66 = $62 >>> $64;
     $67 = (($65) + ($66))|0;
     $68 = $67 << 1;
     $69 = (6896 + ($68<<2)|0);
     $70 = ((($69)) + 8|0);
     $71 = HEAP32[$70>>2]|0;
     $72 = ((($71)) + 8|0);
     $73 = HEAP32[$72>>2]|0;
     $74 = ($69|0)==($73|0);
     do {
      if ($74) {
       $75 = 1 << $67;
       $76 = $75 ^ -1;
       $77 = $8 & $76;
       HEAP32[1714] = $77;
       $98 = $77;
      } else {
       $78 = HEAP32[(6872)>>2]|0;
       $79 = ($73>>>0)<($78>>>0);
       if ($79) {
        _abort();
        // unreachable;
       }
       $80 = ((($73)) + 12|0);
       $81 = HEAP32[$80>>2]|0;
       $82 = ($81|0)==($71|0);
       if ($82) {
        HEAP32[$80>>2] = $69;
        HEAP32[$70>>2] = $73;
        $98 = $8;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $83 = $67 << 3;
     $84 = (($83) - ($6))|0;
     $85 = $6 | 3;
     $86 = ((($71)) + 4|0);
     HEAP32[$86>>2] = $85;
     $87 = (($71) + ($6)|0);
     $88 = $84 | 1;
     $89 = ((($87)) + 4|0);
     HEAP32[$89>>2] = $88;
     $90 = (($87) + ($84)|0);
     HEAP32[$90>>2] = $84;
     $91 = ($37|0)==(0);
     if (!($91)) {
      $92 = HEAP32[(6876)>>2]|0;
      $93 = $37 >>> 3;
      $94 = $93 << 1;
      $95 = (6896 + ($94<<2)|0);
      $96 = 1 << $93;
      $97 = $98 & $96;
      $99 = ($97|0)==(0);
      if ($99) {
       $100 = $98 | $96;
       HEAP32[1714] = $100;
       $$pre = ((($95)) + 8|0);
       $$0199 = $95;$$pre$phiZ2D = $$pre;
      } else {
       $101 = ((($95)) + 8|0);
       $102 = HEAP32[$101>>2]|0;
       $103 = HEAP32[(6872)>>2]|0;
       $104 = ($102>>>0)<($103>>>0);
       if ($104) {
        _abort();
        // unreachable;
       } else {
        $$0199 = $102;$$pre$phiZ2D = $101;
       }
      }
      HEAP32[$$pre$phiZ2D>>2] = $92;
      $105 = ((($$0199)) + 12|0);
      HEAP32[$105>>2] = $92;
      $106 = ((($92)) + 8|0);
      HEAP32[$106>>2] = $$0199;
      $107 = ((($92)) + 12|0);
      HEAP32[$107>>2] = $95;
     }
     HEAP32[(6864)>>2] = $84;
     HEAP32[(6876)>>2] = $87;
     $$0 = $72;
     STACKTOP = sp;return ($$0|0);
    }
    $108 = HEAP32[(6860)>>2]|0;
    $109 = ($108|0)==(0);
    if ($109) {
     $$0197 = $6;
    } else {
     $110 = (0 - ($108))|0;
     $111 = $108 & $110;
     $112 = (($111) + -1)|0;
     $113 = $112 >>> 12;
     $114 = $113 & 16;
     $115 = $112 >>> $114;
     $116 = $115 >>> 5;
     $117 = $116 & 8;
     $118 = $117 | $114;
     $119 = $115 >>> $117;
     $120 = $119 >>> 2;
     $121 = $120 & 4;
     $122 = $118 | $121;
     $123 = $119 >>> $121;
     $124 = $123 >>> 1;
     $125 = $124 & 2;
     $126 = $122 | $125;
     $127 = $123 >>> $125;
     $128 = $127 >>> 1;
     $129 = $128 & 1;
     $130 = $126 | $129;
     $131 = $127 >>> $129;
     $132 = (($130) + ($131))|0;
     $133 = (7160 + ($132<<2)|0);
     $134 = HEAP32[$133>>2]|0;
     $135 = ((($134)) + 4|0);
     $136 = HEAP32[$135>>2]|0;
     $137 = $136 & -8;
     $138 = (($137) - ($6))|0;
     $139 = ((($134)) + 16|0);
     $140 = HEAP32[$139>>2]|0;
     $not$5$i = ($140|0)==(0|0);
     $$sink16$i = $not$5$i&1;
     $141 = (((($134)) + 16|0) + ($$sink16$i<<2)|0);
     $142 = HEAP32[$141>>2]|0;
     $143 = ($142|0)==(0|0);
     if ($143) {
      $$0192$lcssa$i = $134;$$0193$lcssa$i = $138;
     } else {
      $$01928$i = $134;$$01937$i = $138;$145 = $142;
      while(1) {
       $144 = ((($145)) + 4|0);
       $146 = HEAP32[$144>>2]|0;
       $147 = $146 & -8;
       $148 = (($147) - ($6))|0;
       $149 = ($148>>>0)<($$01937$i>>>0);
       $$$0193$i = $149 ? $148 : $$01937$i;
       $$$0192$i = $149 ? $145 : $$01928$i;
       $150 = ((($145)) + 16|0);
       $151 = HEAP32[$150>>2]|0;
       $not$$i = ($151|0)==(0|0);
       $$sink1$i = $not$$i&1;
       $152 = (((($145)) + 16|0) + ($$sink1$i<<2)|0);
       $153 = HEAP32[$152>>2]|0;
       $154 = ($153|0)==(0|0);
       if ($154) {
        $$0192$lcssa$i = $$$0192$i;$$0193$lcssa$i = $$$0193$i;
        break;
       } else {
        $$01928$i = $$$0192$i;$$01937$i = $$$0193$i;$145 = $153;
       }
      }
     }
     $155 = HEAP32[(6872)>>2]|0;
     $156 = ($$0192$lcssa$i>>>0)<($155>>>0);
     if ($156) {
      _abort();
      // unreachable;
     }
     $157 = (($$0192$lcssa$i) + ($6)|0);
     $158 = ($$0192$lcssa$i>>>0)<($157>>>0);
     if (!($158)) {
      _abort();
      // unreachable;
     }
     $159 = ((($$0192$lcssa$i)) + 24|0);
     $160 = HEAP32[$159>>2]|0;
     $161 = ((($$0192$lcssa$i)) + 12|0);
     $162 = HEAP32[$161>>2]|0;
     $163 = ($162|0)==($$0192$lcssa$i|0);
     do {
      if ($163) {
       $173 = ((($$0192$lcssa$i)) + 20|0);
       $174 = HEAP32[$173>>2]|0;
       $175 = ($174|0)==(0|0);
       if ($175) {
        $176 = ((($$0192$lcssa$i)) + 16|0);
        $177 = HEAP32[$176>>2]|0;
        $178 = ($177|0)==(0|0);
        if ($178) {
         $$3$i = 0;
         break;
        } else {
         $$1196$i = $177;$$1198$i = $176;
        }
       } else {
        $$1196$i = $174;$$1198$i = $173;
       }
       while(1) {
        $179 = ((($$1196$i)) + 20|0);
        $180 = HEAP32[$179>>2]|0;
        $181 = ($180|0)==(0|0);
        if (!($181)) {
         $$1196$i = $180;$$1198$i = $179;
         continue;
        }
        $182 = ((($$1196$i)) + 16|0);
        $183 = HEAP32[$182>>2]|0;
        $184 = ($183|0)==(0|0);
        if ($184) {
         break;
        } else {
         $$1196$i = $183;$$1198$i = $182;
        }
       }
       $185 = ($$1198$i>>>0)<($155>>>0);
       if ($185) {
        _abort();
        // unreachable;
       } else {
        HEAP32[$$1198$i>>2] = 0;
        $$3$i = $$1196$i;
        break;
       }
      } else {
       $164 = ((($$0192$lcssa$i)) + 8|0);
       $165 = HEAP32[$164>>2]|0;
       $166 = ($165>>>0)<($155>>>0);
       if ($166) {
        _abort();
        // unreachable;
       }
       $167 = ((($165)) + 12|0);
       $168 = HEAP32[$167>>2]|0;
       $169 = ($168|0)==($$0192$lcssa$i|0);
       if (!($169)) {
        _abort();
        // unreachable;
       }
       $170 = ((($162)) + 8|0);
       $171 = HEAP32[$170>>2]|0;
       $172 = ($171|0)==($$0192$lcssa$i|0);
       if ($172) {
        HEAP32[$167>>2] = $162;
        HEAP32[$170>>2] = $165;
        $$3$i = $162;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $186 = ($160|0)==(0|0);
     L73: do {
      if (!($186)) {
       $187 = ((($$0192$lcssa$i)) + 28|0);
       $188 = HEAP32[$187>>2]|0;
       $189 = (7160 + ($188<<2)|0);
       $190 = HEAP32[$189>>2]|0;
       $191 = ($$0192$lcssa$i|0)==($190|0);
       do {
        if ($191) {
         HEAP32[$189>>2] = $$3$i;
         $cond$i = ($$3$i|0)==(0|0);
         if ($cond$i) {
          $192 = 1 << $188;
          $193 = $192 ^ -1;
          $194 = $108 & $193;
          HEAP32[(6860)>>2] = $194;
          break L73;
         }
        } else {
         $195 = HEAP32[(6872)>>2]|0;
         $196 = ($160>>>0)<($195>>>0);
         if ($196) {
          _abort();
          // unreachable;
         } else {
          $197 = ((($160)) + 16|0);
          $198 = HEAP32[$197>>2]|0;
          $not$1$i = ($198|0)!=($$0192$lcssa$i|0);
          $$sink2$i = $not$1$i&1;
          $199 = (((($160)) + 16|0) + ($$sink2$i<<2)|0);
          HEAP32[$199>>2] = $$3$i;
          $200 = ($$3$i|0)==(0|0);
          if ($200) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while(0);
       $201 = HEAP32[(6872)>>2]|0;
       $202 = ($$3$i>>>0)<($201>>>0);
       if ($202) {
        _abort();
        // unreachable;
       }
       $203 = ((($$3$i)) + 24|0);
       HEAP32[$203>>2] = $160;
       $204 = ((($$0192$lcssa$i)) + 16|0);
       $205 = HEAP32[$204>>2]|0;
       $206 = ($205|0)==(0|0);
       do {
        if (!($206)) {
         $207 = ($205>>>0)<($201>>>0);
         if ($207) {
          _abort();
          // unreachable;
         } else {
          $208 = ((($$3$i)) + 16|0);
          HEAP32[$208>>2] = $205;
          $209 = ((($205)) + 24|0);
          HEAP32[$209>>2] = $$3$i;
          break;
         }
        }
       } while(0);
       $210 = ((($$0192$lcssa$i)) + 20|0);
       $211 = HEAP32[$210>>2]|0;
       $212 = ($211|0)==(0|0);
       if (!($212)) {
        $213 = HEAP32[(6872)>>2]|0;
        $214 = ($211>>>0)<($213>>>0);
        if ($214) {
         _abort();
         // unreachable;
        } else {
         $215 = ((($$3$i)) + 20|0);
         HEAP32[$215>>2] = $211;
         $216 = ((($211)) + 24|0);
         HEAP32[$216>>2] = $$3$i;
         break;
        }
       }
      }
     } while(0);
     $217 = ($$0193$lcssa$i>>>0)<(16);
     if ($217) {
      $218 = (($$0193$lcssa$i) + ($6))|0;
      $219 = $218 | 3;
      $220 = ((($$0192$lcssa$i)) + 4|0);
      HEAP32[$220>>2] = $219;
      $221 = (($$0192$lcssa$i) + ($218)|0);
      $222 = ((($221)) + 4|0);
      $223 = HEAP32[$222>>2]|0;
      $224 = $223 | 1;
      HEAP32[$222>>2] = $224;
     } else {
      $225 = $6 | 3;
      $226 = ((($$0192$lcssa$i)) + 4|0);
      HEAP32[$226>>2] = $225;
      $227 = $$0193$lcssa$i | 1;
      $228 = ((($157)) + 4|0);
      HEAP32[$228>>2] = $227;
      $229 = (($157) + ($$0193$lcssa$i)|0);
      HEAP32[$229>>2] = $$0193$lcssa$i;
      $230 = ($37|0)==(0);
      if (!($230)) {
       $231 = HEAP32[(6876)>>2]|0;
       $232 = $37 >>> 3;
       $233 = $232 << 1;
       $234 = (6896 + ($233<<2)|0);
       $235 = 1 << $232;
       $236 = $8 & $235;
       $237 = ($236|0)==(0);
       if ($237) {
        $238 = $8 | $235;
        HEAP32[1714] = $238;
        $$pre$i = ((($234)) + 8|0);
        $$0189$i = $234;$$pre$phi$iZ2D = $$pre$i;
       } else {
        $239 = ((($234)) + 8|0);
        $240 = HEAP32[$239>>2]|0;
        $241 = HEAP32[(6872)>>2]|0;
        $242 = ($240>>>0)<($241>>>0);
        if ($242) {
         _abort();
         // unreachable;
        } else {
         $$0189$i = $240;$$pre$phi$iZ2D = $239;
        }
       }
       HEAP32[$$pre$phi$iZ2D>>2] = $231;
       $243 = ((($$0189$i)) + 12|0);
       HEAP32[$243>>2] = $231;
       $244 = ((($231)) + 8|0);
       HEAP32[$244>>2] = $$0189$i;
       $245 = ((($231)) + 12|0);
       HEAP32[$245>>2] = $234;
      }
      HEAP32[(6864)>>2] = $$0193$lcssa$i;
      HEAP32[(6876)>>2] = $157;
     }
     $246 = ((($$0192$lcssa$i)) + 8|0);
     $$0 = $246;
     STACKTOP = sp;return ($$0|0);
    }
   } else {
    $$0197 = $6;
   }
  } else {
   $247 = ($0>>>0)>(4294967231);
   if ($247) {
    $$0197 = -1;
   } else {
    $248 = (($0) + 11)|0;
    $249 = $248 & -8;
    $250 = HEAP32[(6860)>>2]|0;
    $251 = ($250|0)==(0);
    if ($251) {
     $$0197 = $249;
    } else {
     $252 = (0 - ($249))|0;
     $253 = $248 >>> 8;
     $254 = ($253|0)==(0);
     if ($254) {
      $$0358$i = 0;
     } else {
      $255 = ($249>>>0)>(16777215);
      if ($255) {
       $$0358$i = 31;
      } else {
       $256 = (($253) + 1048320)|0;
       $257 = $256 >>> 16;
       $258 = $257 & 8;
       $259 = $253 << $258;
       $260 = (($259) + 520192)|0;
       $261 = $260 >>> 16;
       $262 = $261 & 4;
       $263 = $262 | $258;
       $264 = $259 << $262;
       $265 = (($264) + 245760)|0;
       $266 = $265 >>> 16;
       $267 = $266 & 2;
       $268 = $263 | $267;
       $269 = (14 - ($268))|0;
       $270 = $264 << $267;
       $271 = $270 >>> 15;
       $272 = (($269) + ($271))|0;
       $273 = $272 << 1;
       $274 = (($272) + 7)|0;
       $275 = $249 >>> $274;
       $276 = $275 & 1;
       $277 = $276 | $273;
       $$0358$i = $277;
      }
     }
     $278 = (7160 + ($$0358$i<<2)|0);
     $279 = HEAP32[$278>>2]|0;
     $280 = ($279|0)==(0|0);
     L117: do {
      if ($280) {
       $$2355$i = 0;$$3$i201 = 0;$$3350$i = $252;
       label = 81;
      } else {
       $281 = ($$0358$i|0)==(31);
       $282 = $$0358$i >>> 1;
       $283 = (25 - ($282))|0;
       $284 = $281 ? 0 : $283;
       $285 = $249 << $284;
       $$0342$i = 0;$$0347$i = $252;$$0353$i = $279;$$0359$i = $285;$$0362$i = 0;
       while(1) {
        $286 = ((($$0353$i)) + 4|0);
        $287 = HEAP32[$286>>2]|0;
        $288 = $287 & -8;
        $289 = (($288) - ($249))|0;
        $290 = ($289>>>0)<($$0347$i>>>0);
        if ($290) {
         $291 = ($289|0)==(0);
         if ($291) {
          $$415$i = $$0353$i;$$435114$i = 0;$$435713$i = $$0353$i;
          label = 85;
          break L117;
         } else {
          $$1343$i = $$0353$i;$$1348$i = $289;
         }
        } else {
         $$1343$i = $$0342$i;$$1348$i = $$0347$i;
        }
        $292 = ((($$0353$i)) + 20|0);
        $293 = HEAP32[$292>>2]|0;
        $294 = $$0359$i >>> 31;
        $295 = (((($$0353$i)) + 16|0) + ($294<<2)|0);
        $296 = HEAP32[$295>>2]|0;
        $297 = ($293|0)==(0|0);
        $298 = ($293|0)==($296|0);
        $or$cond2$i = $297 | $298;
        $$1363$i = $or$cond2$i ? $$0362$i : $293;
        $299 = ($296|0)==(0|0);
        $not$8$i = $299 ^ 1;
        $300 = $not$8$i&1;
        $$0359$$i = $$0359$i << $300;
        if ($299) {
         $$2355$i = $$1363$i;$$3$i201 = $$1343$i;$$3350$i = $$1348$i;
         label = 81;
         break;
        } else {
         $$0342$i = $$1343$i;$$0347$i = $$1348$i;$$0353$i = $296;$$0359$i = $$0359$$i;$$0362$i = $$1363$i;
        }
       }
      }
     } while(0);
     if ((label|0) == 81) {
      $301 = ($$2355$i|0)==(0|0);
      $302 = ($$3$i201|0)==(0|0);
      $or$cond$i = $301 & $302;
      if ($or$cond$i) {
       $303 = 2 << $$0358$i;
       $304 = (0 - ($303))|0;
       $305 = $303 | $304;
       $306 = $250 & $305;
       $307 = ($306|0)==(0);
       if ($307) {
        $$0197 = $249;
        break;
       }
       $308 = (0 - ($306))|0;
       $309 = $306 & $308;
       $310 = (($309) + -1)|0;
       $311 = $310 >>> 12;
       $312 = $311 & 16;
       $313 = $310 >>> $312;
       $314 = $313 >>> 5;
       $315 = $314 & 8;
       $316 = $315 | $312;
       $317 = $313 >>> $315;
       $318 = $317 >>> 2;
       $319 = $318 & 4;
       $320 = $316 | $319;
       $321 = $317 >>> $319;
       $322 = $321 >>> 1;
       $323 = $322 & 2;
       $324 = $320 | $323;
       $325 = $321 >>> $323;
       $326 = $325 >>> 1;
       $327 = $326 & 1;
       $328 = $324 | $327;
       $329 = $325 >>> $327;
       $330 = (($328) + ($329))|0;
       $331 = (7160 + ($330<<2)|0);
       $332 = HEAP32[$331>>2]|0;
       $$4$ph$i = 0;$$4357$ph$i = $332;
      } else {
       $$4$ph$i = $$3$i201;$$4357$ph$i = $$2355$i;
      }
      $333 = ($$4357$ph$i|0)==(0|0);
      if ($333) {
       $$4$lcssa$i = $$4$ph$i;$$4351$lcssa$i = $$3350$i;
      } else {
       $$415$i = $$4$ph$i;$$435114$i = $$3350$i;$$435713$i = $$4357$ph$i;
       label = 85;
      }
     }
     if ((label|0) == 85) {
      while(1) {
       label = 0;
       $334 = ((($$435713$i)) + 4|0);
       $335 = HEAP32[$334>>2]|0;
       $336 = $335 & -8;
       $337 = (($336) - ($249))|0;
       $338 = ($337>>>0)<($$435114$i>>>0);
       $$$4351$i = $338 ? $337 : $$435114$i;
       $$4357$$4$i = $338 ? $$435713$i : $$415$i;
       $339 = ((($$435713$i)) + 16|0);
       $340 = HEAP32[$339>>2]|0;
       $not$1$i203 = ($340|0)==(0|0);
       $$sink2$i204 = $not$1$i203&1;
       $341 = (((($$435713$i)) + 16|0) + ($$sink2$i204<<2)|0);
       $342 = HEAP32[$341>>2]|0;
       $343 = ($342|0)==(0|0);
       if ($343) {
        $$4$lcssa$i = $$4357$$4$i;$$4351$lcssa$i = $$$4351$i;
        break;
       } else {
        $$415$i = $$4357$$4$i;$$435114$i = $$$4351$i;$$435713$i = $342;
        label = 85;
       }
      }
     }
     $344 = ($$4$lcssa$i|0)==(0|0);
     if ($344) {
      $$0197 = $249;
     } else {
      $345 = HEAP32[(6864)>>2]|0;
      $346 = (($345) - ($249))|0;
      $347 = ($$4351$lcssa$i>>>0)<($346>>>0);
      if ($347) {
       $348 = HEAP32[(6872)>>2]|0;
       $349 = ($$4$lcssa$i>>>0)<($348>>>0);
       if ($349) {
        _abort();
        // unreachable;
       }
       $350 = (($$4$lcssa$i) + ($249)|0);
       $351 = ($$4$lcssa$i>>>0)<($350>>>0);
       if (!($351)) {
        _abort();
        // unreachable;
       }
       $352 = ((($$4$lcssa$i)) + 24|0);
       $353 = HEAP32[$352>>2]|0;
       $354 = ((($$4$lcssa$i)) + 12|0);
       $355 = HEAP32[$354>>2]|0;
       $356 = ($355|0)==($$4$lcssa$i|0);
       do {
        if ($356) {
         $366 = ((($$4$lcssa$i)) + 20|0);
         $367 = HEAP32[$366>>2]|0;
         $368 = ($367|0)==(0|0);
         if ($368) {
          $369 = ((($$4$lcssa$i)) + 16|0);
          $370 = HEAP32[$369>>2]|0;
          $371 = ($370|0)==(0|0);
          if ($371) {
           $$3372$i = 0;
           break;
          } else {
           $$1370$i = $370;$$1374$i = $369;
          }
         } else {
          $$1370$i = $367;$$1374$i = $366;
         }
         while(1) {
          $372 = ((($$1370$i)) + 20|0);
          $373 = HEAP32[$372>>2]|0;
          $374 = ($373|0)==(0|0);
          if (!($374)) {
           $$1370$i = $373;$$1374$i = $372;
           continue;
          }
          $375 = ((($$1370$i)) + 16|0);
          $376 = HEAP32[$375>>2]|0;
          $377 = ($376|0)==(0|0);
          if ($377) {
           break;
          } else {
           $$1370$i = $376;$$1374$i = $375;
          }
         }
         $378 = ($$1374$i>>>0)<($348>>>0);
         if ($378) {
          _abort();
          // unreachable;
         } else {
          HEAP32[$$1374$i>>2] = 0;
          $$3372$i = $$1370$i;
          break;
         }
        } else {
         $357 = ((($$4$lcssa$i)) + 8|0);
         $358 = HEAP32[$357>>2]|0;
         $359 = ($358>>>0)<($348>>>0);
         if ($359) {
          _abort();
          // unreachable;
         }
         $360 = ((($358)) + 12|0);
         $361 = HEAP32[$360>>2]|0;
         $362 = ($361|0)==($$4$lcssa$i|0);
         if (!($362)) {
          _abort();
          // unreachable;
         }
         $363 = ((($355)) + 8|0);
         $364 = HEAP32[$363>>2]|0;
         $365 = ($364|0)==($$4$lcssa$i|0);
         if ($365) {
          HEAP32[$360>>2] = $355;
          HEAP32[$363>>2] = $358;
          $$3372$i = $355;
          break;
         } else {
          _abort();
          // unreachable;
         }
        }
       } while(0);
       $379 = ($353|0)==(0|0);
       L164: do {
        if ($379) {
         $470 = $250;
        } else {
         $380 = ((($$4$lcssa$i)) + 28|0);
         $381 = HEAP32[$380>>2]|0;
         $382 = (7160 + ($381<<2)|0);
         $383 = HEAP32[$382>>2]|0;
         $384 = ($$4$lcssa$i|0)==($383|0);
         do {
          if ($384) {
           HEAP32[$382>>2] = $$3372$i;
           $cond$i208 = ($$3372$i|0)==(0|0);
           if ($cond$i208) {
            $385 = 1 << $381;
            $386 = $385 ^ -1;
            $387 = $250 & $386;
            HEAP32[(6860)>>2] = $387;
            $470 = $387;
            break L164;
           }
          } else {
           $388 = HEAP32[(6872)>>2]|0;
           $389 = ($353>>>0)<($388>>>0);
           if ($389) {
            _abort();
            // unreachable;
           } else {
            $390 = ((($353)) + 16|0);
            $391 = HEAP32[$390>>2]|0;
            $not$$i209 = ($391|0)!=($$4$lcssa$i|0);
            $$sink3$i = $not$$i209&1;
            $392 = (((($353)) + 16|0) + ($$sink3$i<<2)|0);
            HEAP32[$392>>2] = $$3372$i;
            $393 = ($$3372$i|0)==(0|0);
            if ($393) {
             $470 = $250;
             break L164;
            } else {
             break;
            }
           }
          }
         } while(0);
         $394 = HEAP32[(6872)>>2]|0;
         $395 = ($$3372$i>>>0)<($394>>>0);
         if ($395) {
          _abort();
          // unreachable;
         }
         $396 = ((($$3372$i)) + 24|0);
         HEAP32[$396>>2] = $353;
         $397 = ((($$4$lcssa$i)) + 16|0);
         $398 = HEAP32[$397>>2]|0;
         $399 = ($398|0)==(0|0);
         do {
          if (!($399)) {
           $400 = ($398>>>0)<($394>>>0);
           if ($400) {
            _abort();
            // unreachable;
           } else {
            $401 = ((($$3372$i)) + 16|0);
            HEAP32[$401>>2] = $398;
            $402 = ((($398)) + 24|0);
            HEAP32[$402>>2] = $$3372$i;
            break;
           }
          }
         } while(0);
         $403 = ((($$4$lcssa$i)) + 20|0);
         $404 = HEAP32[$403>>2]|0;
         $405 = ($404|0)==(0|0);
         if ($405) {
          $470 = $250;
         } else {
          $406 = HEAP32[(6872)>>2]|0;
          $407 = ($404>>>0)<($406>>>0);
          if ($407) {
           _abort();
           // unreachable;
          } else {
           $408 = ((($$3372$i)) + 20|0);
           HEAP32[$408>>2] = $404;
           $409 = ((($404)) + 24|0);
           HEAP32[$409>>2] = $$3372$i;
           $470 = $250;
           break;
          }
         }
        }
       } while(0);
       $410 = ($$4351$lcssa$i>>>0)<(16);
       do {
        if ($410) {
         $411 = (($$4351$lcssa$i) + ($249))|0;
         $412 = $411 | 3;
         $413 = ((($$4$lcssa$i)) + 4|0);
         HEAP32[$413>>2] = $412;
         $414 = (($$4$lcssa$i) + ($411)|0);
         $415 = ((($414)) + 4|0);
         $416 = HEAP32[$415>>2]|0;
         $417 = $416 | 1;
         HEAP32[$415>>2] = $417;
        } else {
         $418 = $249 | 3;
         $419 = ((($$4$lcssa$i)) + 4|0);
         HEAP32[$419>>2] = $418;
         $420 = $$4351$lcssa$i | 1;
         $421 = ((($350)) + 4|0);
         HEAP32[$421>>2] = $420;
         $422 = (($350) + ($$4351$lcssa$i)|0);
         HEAP32[$422>>2] = $$4351$lcssa$i;
         $423 = $$4351$lcssa$i >>> 3;
         $424 = ($$4351$lcssa$i>>>0)<(256);
         if ($424) {
          $425 = $423 << 1;
          $426 = (6896 + ($425<<2)|0);
          $427 = HEAP32[1714]|0;
          $428 = 1 << $423;
          $429 = $427 & $428;
          $430 = ($429|0)==(0);
          if ($430) {
           $431 = $427 | $428;
           HEAP32[1714] = $431;
           $$pre$i210 = ((($426)) + 8|0);
           $$0368$i = $426;$$pre$phi$i211Z2D = $$pre$i210;
          } else {
           $432 = ((($426)) + 8|0);
           $433 = HEAP32[$432>>2]|0;
           $434 = HEAP32[(6872)>>2]|0;
           $435 = ($433>>>0)<($434>>>0);
           if ($435) {
            _abort();
            // unreachable;
           } else {
            $$0368$i = $433;$$pre$phi$i211Z2D = $432;
           }
          }
          HEAP32[$$pre$phi$i211Z2D>>2] = $350;
          $436 = ((($$0368$i)) + 12|0);
          HEAP32[$436>>2] = $350;
          $437 = ((($350)) + 8|0);
          HEAP32[$437>>2] = $$0368$i;
          $438 = ((($350)) + 12|0);
          HEAP32[$438>>2] = $426;
          break;
         }
         $439 = $$4351$lcssa$i >>> 8;
         $440 = ($439|0)==(0);
         if ($440) {
          $$0361$i = 0;
         } else {
          $441 = ($$4351$lcssa$i>>>0)>(16777215);
          if ($441) {
           $$0361$i = 31;
          } else {
           $442 = (($439) + 1048320)|0;
           $443 = $442 >>> 16;
           $444 = $443 & 8;
           $445 = $439 << $444;
           $446 = (($445) + 520192)|0;
           $447 = $446 >>> 16;
           $448 = $447 & 4;
           $449 = $448 | $444;
           $450 = $445 << $448;
           $451 = (($450) + 245760)|0;
           $452 = $451 >>> 16;
           $453 = $452 & 2;
           $454 = $449 | $453;
           $455 = (14 - ($454))|0;
           $456 = $450 << $453;
           $457 = $456 >>> 15;
           $458 = (($455) + ($457))|0;
           $459 = $458 << 1;
           $460 = (($458) + 7)|0;
           $461 = $$4351$lcssa$i >>> $460;
           $462 = $461 & 1;
           $463 = $462 | $459;
           $$0361$i = $463;
          }
         }
         $464 = (7160 + ($$0361$i<<2)|0);
         $465 = ((($350)) + 28|0);
         HEAP32[$465>>2] = $$0361$i;
         $466 = ((($350)) + 16|0);
         $467 = ((($466)) + 4|0);
         HEAP32[$467>>2] = 0;
         HEAP32[$466>>2] = 0;
         $468 = 1 << $$0361$i;
         $469 = $470 & $468;
         $471 = ($469|0)==(0);
         if ($471) {
          $472 = $470 | $468;
          HEAP32[(6860)>>2] = $472;
          HEAP32[$464>>2] = $350;
          $473 = ((($350)) + 24|0);
          HEAP32[$473>>2] = $464;
          $474 = ((($350)) + 12|0);
          HEAP32[$474>>2] = $350;
          $475 = ((($350)) + 8|0);
          HEAP32[$475>>2] = $350;
          break;
         }
         $476 = HEAP32[$464>>2]|0;
         $477 = ($$0361$i|0)==(31);
         $478 = $$0361$i >>> 1;
         $479 = (25 - ($478))|0;
         $480 = $477 ? 0 : $479;
         $481 = $$4351$lcssa$i << $480;
         $$0344$i = $481;$$0345$i = $476;
         while(1) {
          $482 = ((($$0345$i)) + 4|0);
          $483 = HEAP32[$482>>2]|0;
          $484 = $483 & -8;
          $485 = ($484|0)==($$4351$lcssa$i|0);
          if ($485) {
           label = 139;
           break;
          }
          $486 = $$0344$i >>> 31;
          $487 = (((($$0345$i)) + 16|0) + ($486<<2)|0);
          $488 = $$0344$i << 1;
          $489 = HEAP32[$487>>2]|0;
          $490 = ($489|0)==(0|0);
          if ($490) {
           label = 136;
           break;
          } else {
           $$0344$i = $488;$$0345$i = $489;
          }
         }
         if ((label|0) == 136) {
          $491 = HEAP32[(6872)>>2]|0;
          $492 = ($487>>>0)<($491>>>0);
          if ($492) {
           _abort();
           // unreachable;
          } else {
           HEAP32[$487>>2] = $350;
           $493 = ((($350)) + 24|0);
           HEAP32[$493>>2] = $$0345$i;
           $494 = ((($350)) + 12|0);
           HEAP32[$494>>2] = $350;
           $495 = ((($350)) + 8|0);
           HEAP32[$495>>2] = $350;
           break;
          }
         }
         else if ((label|0) == 139) {
          $496 = ((($$0345$i)) + 8|0);
          $497 = HEAP32[$496>>2]|0;
          $498 = HEAP32[(6872)>>2]|0;
          $499 = ($497>>>0)>=($498>>>0);
          $not$9$i = ($$0345$i>>>0)>=($498>>>0);
          $500 = $499 & $not$9$i;
          if ($500) {
           $501 = ((($497)) + 12|0);
           HEAP32[$501>>2] = $350;
           HEAP32[$496>>2] = $350;
           $502 = ((($350)) + 8|0);
           HEAP32[$502>>2] = $497;
           $503 = ((($350)) + 12|0);
           HEAP32[$503>>2] = $$0345$i;
           $504 = ((($350)) + 24|0);
           HEAP32[$504>>2] = 0;
           break;
          } else {
           _abort();
           // unreachable;
          }
         }
        }
       } while(0);
       $505 = ((($$4$lcssa$i)) + 8|0);
       $$0 = $505;
       STACKTOP = sp;return ($$0|0);
      } else {
       $$0197 = $249;
      }
     }
    }
   }
  }
 } while(0);
 $506 = HEAP32[(6864)>>2]|0;
 $507 = ($506>>>0)<($$0197>>>0);
 if (!($507)) {
  $508 = (($506) - ($$0197))|0;
  $509 = HEAP32[(6876)>>2]|0;
  $510 = ($508>>>0)>(15);
  if ($510) {
   $511 = (($509) + ($$0197)|0);
   HEAP32[(6876)>>2] = $511;
   HEAP32[(6864)>>2] = $508;
   $512 = $508 | 1;
   $513 = ((($511)) + 4|0);
   HEAP32[$513>>2] = $512;
   $514 = (($511) + ($508)|0);
   HEAP32[$514>>2] = $508;
   $515 = $$0197 | 3;
   $516 = ((($509)) + 4|0);
   HEAP32[$516>>2] = $515;
  } else {
   HEAP32[(6864)>>2] = 0;
   HEAP32[(6876)>>2] = 0;
   $517 = $506 | 3;
   $518 = ((($509)) + 4|0);
   HEAP32[$518>>2] = $517;
   $519 = (($509) + ($506)|0);
   $520 = ((($519)) + 4|0);
   $521 = HEAP32[$520>>2]|0;
   $522 = $521 | 1;
   HEAP32[$520>>2] = $522;
  }
  $523 = ((($509)) + 8|0);
  $$0 = $523;
  STACKTOP = sp;return ($$0|0);
 }
 $524 = HEAP32[(6868)>>2]|0;
 $525 = ($524>>>0)>($$0197>>>0);
 if ($525) {
  $526 = (($524) - ($$0197))|0;
  HEAP32[(6868)>>2] = $526;
  $527 = HEAP32[(6880)>>2]|0;
  $528 = (($527) + ($$0197)|0);
  HEAP32[(6880)>>2] = $528;
  $529 = $526 | 1;
  $530 = ((($528)) + 4|0);
  HEAP32[$530>>2] = $529;
  $531 = $$0197 | 3;
  $532 = ((($527)) + 4|0);
  HEAP32[$532>>2] = $531;
  $533 = ((($527)) + 8|0);
  $$0 = $533;
  STACKTOP = sp;return ($$0|0);
 }
 $534 = HEAP32[1832]|0;
 $535 = ($534|0)==(0);
 if ($535) {
  HEAP32[(7336)>>2] = 4096;
  HEAP32[(7332)>>2] = 4096;
  HEAP32[(7340)>>2] = -1;
  HEAP32[(7344)>>2] = -1;
  HEAP32[(7348)>>2] = 0;
  HEAP32[(7300)>>2] = 0;
  $536 = $1;
  $537 = $536 & -16;
  $538 = $537 ^ 1431655768;
  HEAP32[$1>>2] = $538;
  HEAP32[1832] = $538;
  $542 = 4096;
 } else {
  $$pre$i212 = HEAP32[(7336)>>2]|0;
  $542 = $$pre$i212;
 }
 $539 = (($$0197) + 48)|0;
 $540 = (($$0197) + 47)|0;
 $541 = (($542) + ($540))|0;
 $543 = (0 - ($542))|0;
 $544 = $541 & $543;
 $545 = ($544>>>0)>($$0197>>>0);
 if (!($545)) {
  $$0 = 0;
  STACKTOP = sp;return ($$0|0);
 }
 $546 = HEAP32[(7296)>>2]|0;
 $547 = ($546|0)==(0);
 if (!($547)) {
  $548 = HEAP32[(7288)>>2]|0;
  $549 = (($548) + ($544))|0;
  $550 = ($549>>>0)<=($548>>>0);
  $551 = ($549>>>0)>($546>>>0);
  $or$cond1$i = $550 | $551;
  if ($or$cond1$i) {
   $$0 = 0;
   STACKTOP = sp;return ($$0|0);
  }
 }
 $552 = HEAP32[(7300)>>2]|0;
 $553 = $552 & 4;
 $554 = ($553|0)==(0);
 L244: do {
  if ($554) {
   $555 = HEAP32[(6880)>>2]|0;
   $556 = ($555|0)==(0|0);
   L246: do {
    if ($556) {
     label = 163;
    } else {
     $$0$i$i = (7304);
     while(1) {
      $557 = HEAP32[$$0$i$i>>2]|0;
      $558 = ($557>>>0)>($555>>>0);
      if (!($558)) {
       $559 = ((($$0$i$i)) + 4|0);
       $560 = HEAP32[$559>>2]|0;
       $561 = (($557) + ($560)|0);
       $562 = ($561>>>0)>($555>>>0);
       if ($562) {
        break;
       }
      }
      $563 = ((($$0$i$i)) + 8|0);
      $564 = HEAP32[$563>>2]|0;
      $565 = ($564|0)==(0|0);
      if ($565) {
       label = 163;
       break L246;
      } else {
       $$0$i$i = $564;
      }
     }
     $588 = (($541) - ($524))|0;
     $589 = $588 & $543;
     $590 = ($589>>>0)<(2147483647);
     if ($590) {
      $591 = (_sbrk(($589|0))|0);
      $592 = HEAP32[$$0$i$i>>2]|0;
      $593 = HEAP32[$559>>2]|0;
      $594 = (($592) + ($593)|0);
      $595 = ($591|0)==($594|0);
      if ($595) {
       $596 = ($591|0)==((-1)|0);
       if ($596) {
        $$2234253237$i = $589;
       } else {
        $$723948$i = $589;$$749$i = $591;
        label = 180;
        break L244;
       }
      } else {
       $$2247$ph$i = $591;$$2253$ph$i = $589;
       label = 171;
      }
     } else {
      $$2234253237$i = 0;
     }
    }
   } while(0);
   do {
    if ((label|0) == 163) {
     $566 = (_sbrk(0)|0);
     $567 = ($566|0)==((-1)|0);
     if ($567) {
      $$2234253237$i = 0;
     } else {
      $568 = $566;
      $569 = HEAP32[(7332)>>2]|0;
      $570 = (($569) + -1)|0;
      $571 = $570 & $568;
      $572 = ($571|0)==(0);
      $573 = (($570) + ($568))|0;
      $574 = (0 - ($569))|0;
      $575 = $573 & $574;
      $576 = (($575) - ($568))|0;
      $577 = $572 ? 0 : $576;
      $$$i = (($577) + ($544))|0;
      $578 = HEAP32[(7288)>>2]|0;
      $579 = (($$$i) + ($578))|0;
      $580 = ($$$i>>>0)>($$0197>>>0);
      $581 = ($$$i>>>0)<(2147483647);
      $or$cond$i214 = $580 & $581;
      if ($or$cond$i214) {
       $582 = HEAP32[(7296)>>2]|0;
       $583 = ($582|0)==(0);
       if (!($583)) {
        $584 = ($579>>>0)<=($578>>>0);
        $585 = ($579>>>0)>($582>>>0);
        $or$cond2$i215 = $584 | $585;
        if ($or$cond2$i215) {
         $$2234253237$i = 0;
         break;
        }
       }
       $586 = (_sbrk(($$$i|0))|0);
       $587 = ($586|0)==($566|0);
       if ($587) {
        $$723948$i = $$$i;$$749$i = $566;
        label = 180;
        break L244;
       } else {
        $$2247$ph$i = $586;$$2253$ph$i = $$$i;
        label = 171;
       }
      } else {
       $$2234253237$i = 0;
      }
     }
    }
   } while(0);
   do {
    if ((label|0) == 171) {
     $597 = (0 - ($$2253$ph$i))|0;
     $598 = ($$2247$ph$i|0)!=((-1)|0);
     $599 = ($$2253$ph$i>>>0)<(2147483647);
     $or$cond7$i = $599 & $598;
     $600 = ($539>>>0)>($$2253$ph$i>>>0);
     $or$cond10$i = $600 & $or$cond7$i;
     if (!($or$cond10$i)) {
      $610 = ($$2247$ph$i|0)==((-1)|0);
      if ($610) {
       $$2234253237$i = 0;
       break;
      } else {
       $$723948$i = $$2253$ph$i;$$749$i = $$2247$ph$i;
       label = 180;
       break L244;
      }
     }
     $601 = HEAP32[(7336)>>2]|0;
     $602 = (($540) - ($$2253$ph$i))|0;
     $603 = (($602) + ($601))|0;
     $604 = (0 - ($601))|0;
     $605 = $603 & $604;
     $606 = ($605>>>0)<(2147483647);
     if (!($606)) {
      $$723948$i = $$2253$ph$i;$$749$i = $$2247$ph$i;
      label = 180;
      break L244;
     }
     $607 = (_sbrk(($605|0))|0);
     $608 = ($607|0)==((-1)|0);
     if ($608) {
      (_sbrk(($597|0))|0);
      $$2234253237$i = 0;
      break;
     } else {
      $609 = (($605) + ($$2253$ph$i))|0;
      $$723948$i = $609;$$749$i = $$2247$ph$i;
      label = 180;
      break L244;
     }
    }
   } while(0);
   $611 = HEAP32[(7300)>>2]|0;
   $612 = $611 | 4;
   HEAP32[(7300)>>2] = $612;
   $$4236$i = $$2234253237$i;
   label = 178;
  } else {
   $$4236$i = 0;
   label = 178;
  }
 } while(0);
 if ((label|0) == 178) {
  $613 = ($544>>>0)<(2147483647);
  if ($613) {
   $614 = (_sbrk(($544|0))|0);
   $615 = (_sbrk(0)|0);
   $616 = ($614|0)!=((-1)|0);
   $617 = ($615|0)!=((-1)|0);
   $or$cond5$i = $616 & $617;
   $618 = ($614>>>0)<($615>>>0);
   $or$cond11$i = $618 & $or$cond5$i;
   $619 = $615;
   $620 = $614;
   $621 = (($619) - ($620))|0;
   $622 = (($$0197) + 40)|0;
   $623 = ($621>>>0)>($622>>>0);
   $$$4236$i = $623 ? $621 : $$4236$i;
   $or$cond11$not$i = $or$cond11$i ^ 1;
   $624 = ($614|0)==((-1)|0);
   $not$$i216 = $623 ^ 1;
   $625 = $624 | $not$$i216;
   $or$cond50$i = $625 | $or$cond11$not$i;
   if (!($or$cond50$i)) {
    $$723948$i = $$$4236$i;$$749$i = $614;
    label = 180;
   }
  }
 }
 if ((label|0) == 180) {
  $626 = HEAP32[(7288)>>2]|0;
  $627 = (($626) + ($$723948$i))|0;
  HEAP32[(7288)>>2] = $627;
  $628 = HEAP32[(7292)>>2]|0;
  $629 = ($627>>>0)>($628>>>0);
  if ($629) {
   HEAP32[(7292)>>2] = $627;
  }
  $630 = HEAP32[(6880)>>2]|0;
  $631 = ($630|0)==(0|0);
  do {
   if ($631) {
    $632 = HEAP32[(6872)>>2]|0;
    $633 = ($632|0)==(0|0);
    $634 = ($$749$i>>>0)<($632>>>0);
    $or$cond12$i = $633 | $634;
    if ($or$cond12$i) {
     HEAP32[(6872)>>2] = $$749$i;
    }
    HEAP32[(7304)>>2] = $$749$i;
    HEAP32[(7308)>>2] = $$723948$i;
    HEAP32[(7316)>>2] = 0;
    $635 = HEAP32[1832]|0;
    HEAP32[(6892)>>2] = $635;
    HEAP32[(6888)>>2] = -1;
    $$01$i$i = 0;
    while(1) {
     $636 = $$01$i$i << 1;
     $637 = (6896 + ($636<<2)|0);
     $638 = ((($637)) + 12|0);
     HEAP32[$638>>2] = $637;
     $639 = ((($637)) + 8|0);
     HEAP32[$639>>2] = $637;
     $640 = (($$01$i$i) + 1)|0;
     $exitcond$i$i = ($640|0)==(32);
     if ($exitcond$i$i) {
      break;
     } else {
      $$01$i$i = $640;
     }
    }
    $641 = (($$723948$i) + -40)|0;
    $642 = ((($$749$i)) + 8|0);
    $643 = $642;
    $644 = $643 & 7;
    $645 = ($644|0)==(0);
    $646 = (0 - ($643))|0;
    $647 = $646 & 7;
    $648 = $645 ? 0 : $647;
    $649 = (($$749$i) + ($648)|0);
    $650 = (($641) - ($648))|0;
    HEAP32[(6880)>>2] = $649;
    HEAP32[(6868)>>2] = $650;
    $651 = $650 | 1;
    $652 = ((($649)) + 4|0);
    HEAP32[$652>>2] = $651;
    $653 = (($649) + ($650)|0);
    $654 = ((($653)) + 4|0);
    HEAP32[$654>>2] = 40;
    $655 = HEAP32[(7344)>>2]|0;
    HEAP32[(6884)>>2] = $655;
   } else {
    $$024371$i = (7304);
    while(1) {
     $656 = HEAP32[$$024371$i>>2]|0;
     $657 = ((($$024371$i)) + 4|0);
     $658 = HEAP32[$657>>2]|0;
     $659 = (($656) + ($658)|0);
     $660 = ($$749$i|0)==($659|0);
     if ($660) {
      label = 190;
      break;
     }
     $661 = ((($$024371$i)) + 8|0);
     $662 = HEAP32[$661>>2]|0;
     $663 = ($662|0)==(0|0);
     if ($663) {
      break;
     } else {
      $$024371$i = $662;
     }
    }
    if ((label|0) == 190) {
     $664 = ((($$024371$i)) + 12|0);
     $665 = HEAP32[$664>>2]|0;
     $666 = $665 & 8;
     $667 = ($666|0)==(0);
     if ($667) {
      $668 = ($630>>>0)>=($656>>>0);
      $669 = ($630>>>0)<($$749$i>>>0);
      $or$cond51$i = $669 & $668;
      if ($or$cond51$i) {
       $670 = (($658) + ($$723948$i))|0;
       HEAP32[$657>>2] = $670;
       $671 = HEAP32[(6868)>>2]|0;
       $672 = ((($630)) + 8|0);
       $673 = $672;
       $674 = $673 & 7;
       $675 = ($674|0)==(0);
       $676 = (0 - ($673))|0;
       $677 = $676 & 7;
       $678 = $675 ? 0 : $677;
       $679 = (($630) + ($678)|0);
       $680 = (($$723948$i) - ($678))|0;
       $681 = (($671) + ($680))|0;
       HEAP32[(6880)>>2] = $679;
       HEAP32[(6868)>>2] = $681;
       $682 = $681 | 1;
       $683 = ((($679)) + 4|0);
       HEAP32[$683>>2] = $682;
       $684 = (($679) + ($681)|0);
       $685 = ((($684)) + 4|0);
       HEAP32[$685>>2] = 40;
       $686 = HEAP32[(7344)>>2]|0;
       HEAP32[(6884)>>2] = $686;
       break;
      }
     }
    }
    $687 = HEAP32[(6872)>>2]|0;
    $688 = ($$749$i>>>0)<($687>>>0);
    if ($688) {
     HEAP32[(6872)>>2] = $$749$i;
     $752 = $$749$i;
    } else {
     $752 = $687;
    }
    $689 = (($$749$i) + ($$723948$i)|0);
    $$124470$i = (7304);
    while(1) {
     $690 = HEAP32[$$124470$i>>2]|0;
     $691 = ($690|0)==($689|0);
     if ($691) {
      label = 198;
      break;
     }
     $692 = ((($$124470$i)) + 8|0);
     $693 = HEAP32[$692>>2]|0;
     $694 = ($693|0)==(0|0);
     if ($694) {
      break;
     } else {
      $$124470$i = $693;
     }
    }
    if ((label|0) == 198) {
     $695 = ((($$124470$i)) + 12|0);
     $696 = HEAP32[$695>>2]|0;
     $697 = $696 & 8;
     $698 = ($697|0)==(0);
     if ($698) {
      HEAP32[$$124470$i>>2] = $$749$i;
      $699 = ((($$124470$i)) + 4|0);
      $700 = HEAP32[$699>>2]|0;
      $701 = (($700) + ($$723948$i))|0;
      HEAP32[$699>>2] = $701;
      $702 = ((($$749$i)) + 8|0);
      $703 = $702;
      $704 = $703 & 7;
      $705 = ($704|0)==(0);
      $706 = (0 - ($703))|0;
      $707 = $706 & 7;
      $708 = $705 ? 0 : $707;
      $709 = (($$749$i) + ($708)|0);
      $710 = ((($689)) + 8|0);
      $711 = $710;
      $712 = $711 & 7;
      $713 = ($712|0)==(0);
      $714 = (0 - ($711))|0;
      $715 = $714 & 7;
      $716 = $713 ? 0 : $715;
      $717 = (($689) + ($716)|0);
      $718 = $717;
      $719 = $709;
      $720 = (($718) - ($719))|0;
      $721 = (($709) + ($$0197)|0);
      $722 = (($720) - ($$0197))|0;
      $723 = $$0197 | 3;
      $724 = ((($709)) + 4|0);
      HEAP32[$724>>2] = $723;
      $725 = ($717|0)==($630|0);
      do {
       if ($725) {
        $726 = HEAP32[(6868)>>2]|0;
        $727 = (($726) + ($722))|0;
        HEAP32[(6868)>>2] = $727;
        HEAP32[(6880)>>2] = $721;
        $728 = $727 | 1;
        $729 = ((($721)) + 4|0);
        HEAP32[$729>>2] = $728;
       } else {
        $730 = HEAP32[(6876)>>2]|0;
        $731 = ($717|0)==($730|0);
        if ($731) {
         $732 = HEAP32[(6864)>>2]|0;
         $733 = (($732) + ($722))|0;
         HEAP32[(6864)>>2] = $733;
         HEAP32[(6876)>>2] = $721;
         $734 = $733 | 1;
         $735 = ((($721)) + 4|0);
         HEAP32[$735>>2] = $734;
         $736 = (($721) + ($733)|0);
         HEAP32[$736>>2] = $733;
         break;
        }
        $737 = ((($717)) + 4|0);
        $738 = HEAP32[$737>>2]|0;
        $739 = $738 & 3;
        $740 = ($739|0)==(1);
        if ($740) {
         $741 = $738 & -8;
         $742 = $738 >>> 3;
         $743 = ($738>>>0)<(256);
         L314: do {
          if ($743) {
           $744 = ((($717)) + 8|0);
           $745 = HEAP32[$744>>2]|0;
           $746 = ((($717)) + 12|0);
           $747 = HEAP32[$746>>2]|0;
           $748 = $742 << 1;
           $749 = (6896 + ($748<<2)|0);
           $750 = ($745|0)==($749|0);
           do {
            if (!($750)) {
             $751 = ($745>>>0)<($752>>>0);
             if ($751) {
              _abort();
              // unreachable;
             }
             $753 = ((($745)) + 12|0);
             $754 = HEAP32[$753>>2]|0;
             $755 = ($754|0)==($717|0);
             if ($755) {
              break;
             }
             _abort();
             // unreachable;
            }
           } while(0);
           $756 = ($747|0)==($745|0);
           if ($756) {
            $757 = 1 << $742;
            $758 = $757 ^ -1;
            $759 = HEAP32[1714]|0;
            $760 = $759 & $758;
            HEAP32[1714] = $760;
            break;
           }
           $761 = ($747|0)==($749|0);
           do {
            if ($761) {
             $$pre10$i$i = ((($747)) + 8|0);
             $$pre$phi11$i$iZ2D = $$pre10$i$i;
            } else {
             $762 = ($747>>>0)<($752>>>0);
             if ($762) {
              _abort();
              // unreachable;
             }
             $763 = ((($747)) + 8|0);
             $764 = HEAP32[$763>>2]|0;
             $765 = ($764|0)==($717|0);
             if ($765) {
              $$pre$phi11$i$iZ2D = $763;
              break;
             }
             _abort();
             // unreachable;
            }
           } while(0);
           $766 = ((($745)) + 12|0);
           HEAP32[$766>>2] = $747;
           HEAP32[$$pre$phi11$i$iZ2D>>2] = $745;
          } else {
           $767 = ((($717)) + 24|0);
           $768 = HEAP32[$767>>2]|0;
           $769 = ((($717)) + 12|0);
           $770 = HEAP32[$769>>2]|0;
           $771 = ($770|0)==($717|0);
           do {
            if ($771) {
             $781 = ((($717)) + 16|0);
             $782 = ((($781)) + 4|0);
             $783 = HEAP32[$782>>2]|0;
             $784 = ($783|0)==(0|0);
             if ($784) {
              $785 = HEAP32[$781>>2]|0;
              $786 = ($785|0)==(0|0);
              if ($786) {
               $$3$i$i = 0;
               break;
              } else {
               $$1291$i$i = $785;$$1293$i$i = $781;
              }
             } else {
              $$1291$i$i = $783;$$1293$i$i = $782;
             }
             while(1) {
              $787 = ((($$1291$i$i)) + 20|0);
              $788 = HEAP32[$787>>2]|0;
              $789 = ($788|0)==(0|0);
              if (!($789)) {
               $$1291$i$i = $788;$$1293$i$i = $787;
               continue;
              }
              $790 = ((($$1291$i$i)) + 16|0);
              $791 = HEAP32[$790>>2]|0;
              $792 = ($791|0)==(0|0);
              if ($792) {
               break;
              } else {
               $$1291$i$i = $791;$$1293$i$i = $790;
              }
             }
             $793 = ($$1293$i$i>>>0)<($752>>>0);
             if ($793) {
              _abort();
              // unreachable;
             } else {
              HEAP32[$$1293$i$i>>2] = 0;
              $$3$i$i = $$1291$i$i;
              break;
             }
            } else {
             $772 = ((($717)) + 8|0);
             $773 = HEAP32[$772>>2]|0;
             $774 = ($773>>>0)<($752>>>0);
             if ($774) {
              _abort();
              // unreachable;
             }
             $775 = ((($773)) + 12|0);
             $776 = HEAP32[$775>>2]|0;
             $777 = ($776|0)==($717|0);
             if (!($777)) {
              _abort();
              // unreachable;
             }
             $778 = ((($770)) + 8|0);
             $779 = HEAP32[$778>>2]|0;
             $780 = ($779|0)==($717|0);
             if ($780) {
              HEAP32[$775>>2] = $770;
              HEAP32[$778>>2] = $773;
              $$3$i$i = $770;
              break;
             } else {
              _abort();
              // unreachable;
             }
            }
           } while(0);
           $794 = ($768|0)==(0|0);
           if ($794) {
            break;
           }
           $795 = ((($717)) + 28|0);
           $796 = HEAP32[$795>>2]|0;
           $797 = (7160 + ($796<<2)|0);
           $798 = HEAP32[$797>>2]|0;
           $799 = ($717|0)==($798|0);
           do {
            if ($799) {
             HEAP32[$797>>2] = $$3$i$i;
             $cond$i$i = ($$3$i$i|0)==(0|0);
             if (!($cond$i$i)) {
              break;
             }
             $800 = 1 << $796;
             $801 = $800 ^ -1;
             $802 = HEAP32[(6860)>>2]|0;
             $803 = $802 & $801;
             HEAP32[(6860)>>2] = $803;
             break L314;
            } else {
             $804 = HEAP32[(6872)>>2]|0;
             $805 = ($768>>>0)<($804>>>0);
             if ($805) {
              _abort();
              // unreachable;
             } else {
              $806 = ((($768)) + 16|0);
              $807 = HEAP32[$806>>2]|0;
              $not$$i17$i = ($807|0)!=($717|0);
              $$sink1$i$i = $not$$i17$i&1;
              $808 = (((($768)) + 16|0) + ($$sink1$i$i<<2)|0);
              HEAP32[$808>>2] = $$3$i$i;
              $809 = ($$3$i$i|0)==(0|0);
              if ($809) {
               break L314;
              } else {
               break;
              }
             }
            }
           } while(0);
           $810 = HEAP32[(6872)>>2]|0;
           $811 = ($$3$i$i>>>0)<($810>>>0);
           if ($811) {
            _abort();
            // unreachable;
           }
           $812 = ((($$3$i$i)) + 24|0);
           HEAP32[$812>>2] = $768;
           $813 = ((($717)) + 16|0);
           $814 = HEAP32[$813>>2]|0;
           $815 = ($814|0)==(0|0);
           do {
            if (!($815)) {
             $816 = ($814>>>0)<($810>>>0);
             if ($816) {
              _abort();
              // unreachable;
             } else {
              $817 = ((($$3$i$i)) + 16|0);
              HEAP32[$817>>2] = $814;
              $818 = ((($814)) + 24|0);
              HEAP32[$818>>2] = $$3$i$i;
              break;
             }
            }
           } while(0);
           $819 = ((($813)) + 4|0);
           $820 = HEAP32[$819>>2]|0;
           $821 = ($820|0)==(0|0);
           if ($821) {
            break;
           }
           $822 = HEAP32[(6872)>>2]|0;
           $823 = ($820>>>0)<($822>>>0);
           if ($823) {
            _abort();
            // unreachable;
           } else {
            $824 = ((($$3$i$i)) + 20|0);
            HEAP32[$824>>2] = $820;
            $825 = ((($820)) + 24|0);
            HEAP32[$825>>2] = $$3$i$i;
            break;
           }
          }
         } while(0);
         $826 = (($717) + ($741)|0);
         $827 = (($741) + ($722))|0;
         $$0$i18$i = $826;$$0287$i$i = $827;
        } else {
         $$0$i18$i = $717;$$0287$i$i = $722;
        }
        $828 = ((($$0$i18$i)) + 4|0);
        $829 = HEAP32[$828>>2]|0;
        $830 = $829 & -2;
        HEAP32[$828>>2] = $830;
        $831 = $$0287$i$i | 1;
        $832 = ((($721)) + 4|0);
        HEAP32[$832>>2] = $831;
        $833 = (($721) + ($$0287$i$i)|0);
        HEAP32[$833>>2] = $$0287$i$i;
        $834 = $$0287$i$i >>> 3;
        $835 = ($$0287$i$i>>>0)<(256);
        if ($835) {
         $836 = $834 << 1;
         $837 = (6896 + ($836<<2)|0);
         $838 = HEAP32[1714]|0;
         $839 = 1 << $834;
         $840 = $838 & $839;
         $841 = ($840|0)==(0);
         do {
          if ($841) {
           $842 = $838 | $839;
           HEAP32[1714] = $842;
           $$pre$i19$i = ((($837)) + 8|0);
           $$0295$i$i = $837;$$pre$phi$i20$iZ2D = $$pre$i19$i;
          } else {
           $843 = ((($837)) + 8|0);
           $844 = HEAP32[$843>>2]|0;
           $845 = HEAP32[(6872)>>2]|0;
           $846 = ($844>>>0)<($845>>>0);
           if (!($846)) {
            $$0295$i$i = $844;$$pre$phi$i20$iZ2D = $843;
            break;
           }
           _abort();
           // unreachable;
          }
         } while(0);
         HEAP32[$$pre$phi$i20$iZ2D>>2] = $721;
         $847 = ((($$0295$i$i)) + 12|0);
         HEAP32[$847>>2] = $721;
         $848 = ((($721)) + 8|0);
         HEAP32[$848>>2] = $$0295$i$i;
         $849 = ((($721)) + 12|0);
         HEAP32[$849>>2] = $837;
         break;
        }
        $850 = $$0287$i$i >>> 8;
        $851 = ($850|0)==(0);
        do {
         if ($851) {
          $$0296$i$i = 0;
         } else {
          $852 = ($$0287$i$i>>>0)>(16777215);
          if ($852) {
           $$0296$i$i = 31;
           break;
          }
          $853 = (($850) + 1048320)|0;
          $854 = $853 >>> 16;
          $855 = $854 & 8;
          $856 = $850 << $855;
          $857 = (($856) + 520192)|0;
          $858 = $857 >>> 16;
          $859 = $858 & 4;
          $860 = $859 | $855;
          $861 = $856 << $859;
          $862 = (($861) + 245760)|0;
          $863 = $862 >>> 16;
          $864 = $863 & 2;
          $865 = $860 | $864;
          $866 = (14 - ($865))|0;
          $867 = $861 << $864;
          $868 = $867 >>> 15;
          $869 = (($866) + ($868))|0;
          $870 = $869 << 1;
          $871 = (($869) + 7)|0;
          $872 = $$0287$i$i >>> $871;
          $873 = $872 & 1;
          $874 = $873 | $870;
          $$0296$i$i = $874;
         }
        } while(0);
        $875 = (7160 + ($$0296$i$i<<2)|0);
        $876 = ((($721)) + 28|0);
        HEAP32[$876>>2] = $$0296$i$i;
        $877 = ((($721)) + 16|0);
        $878 = ((($877)) + 4|0);
        HEAP32[$878>>2] = 0;
        HEAP32[$877>>2] = 0;
        $879 = HEAP32[(6860)>>2]|0;
        $880 = 1 << $$0296$i$i;
        $881 = $879 & $880;
        $882 = ($881|0)==(0);
        if ($882) {
         $883 = $879 | $880;
         HEAP32[(6860)>>2] = $883;
         HEAP32[$875>>2] = $721;
         $884 = ((($721)) + 24|0);
         HEAP32[$884>>2] = $875;
         $885 = ((($721)) + 12|0);
         HEAP32[$885>>2] = $721;
         $886 = ((($721)) + 8|0);
         HEAP32[$886>>2] = $721;
         break;
        }
        $887 = HEAP32[$875>>2]|0;
        $888 = ($$0296$i$i|0)==(31);
        $889 = $$0296$i$i >>> 1;
        $890 = (25 - ($889))|0;
        $891 = $888 ? 0 : $890;
        $892 = $$0287$i$i << $891;
        $$0288$i$i = $892;$$0289$i$i = $887;
        while(1) {
         $893 = ((($$0289$i$i)) + 4|0);
         $894 = HEAP32[$893>>2]|0;
         $895 = $894 & -8;
         $896 = ($895|0)==($$0287$i$i|0);
         if ($896) {
          label = 265;
          break;
         }
         $897 = $$0288$i$i >>> 31;
         $898 = (((($$0289$i$i)) + 16|0) + ($897<<2)|0);
         $899 = $$0288$i$i << 1;
         $900 = HEAP32[$898>>2]|0;
         $901 = ($900|0)==(0|0);
         if ($901) {
          label = 262;
          break;
         } else {
          $$0288$i$i = $899;$$0289$i$i = $900;
         }
        }
        if ((label|0) == 262) {
         $902 = HEAP32[(6872)>>2]|0;
         $903 = ($898>>>0)<($902>>>0);
         if ($903) {
          _abort();
          // unreachable;
         } else {
          HEAP32[$898>>2] = $721;
          $904 = ((($721)) + 24|0);
          HEAP32[$904>>2] = $$0289$i$i;
          $905 = ((($721)) + 12|0);
          HEAP32[$905>>2] = $721;
          $906 = ((($721)) + 8|0);
          HEAP32[$906>>2] = $721;
          break;
         }
        }
        else if ((label|0) == 265) {
         $907 = ((($$0289$i$i)) + 8|0);
         $908 = HEAP32[$907>>2]|0;
         $909 = HEAP32[(6872)>>2]|0;
         $910 = ($908>>>0)>=($909>>>0);
         $not$7$i$i = ($$0289$i$i>>>0)>=($909>>>0);
         $911 = $910 & $not$7$i$i;
         if ($911) {
          $912 = ((($908)) + 12|0);
          HEAP32[$912>>2] = $721;
          HEAP32[$907>>2] = $721;
          $913 = ((($721)) + 8|0);
          HEAP32[$913>>2] = $908;
          $914 = ((($721)) + 12|0);
          HEAP32[$914>>2] = $$0289$i$i;
          $915 = ((($721)) + 24|0);
          HEAP32[$915>>2] = 0;
          break;
         } else {
          _abort();
          // unreachable;
         }
        }
       }
      } while(0);
      $1047 = ((($709)) + 8|0);
      $$0 = $1047;
      STACKTOP = sp;return ($$0|0);
     }
    }
    $$0$i$i$i = (7304);
    while(1) {
     $916 = HEAP32[$$0$i$i$i>>2]|0;
     $917 = ($916>>>0)>($630>>>0);
     if (!($917)) {
      $918 = ((($$0$i$i$i)) + 4|0);
      $919 = HEAP32[$918>>2]|0;
      $920 = (($916) + ($919)|0);
      $921 = ($920>>>0)>($630>>>0);
      if ($921) {
       break;
      }
     }
     $922 = ((($$0$i$i$i)) + 8|0);
     $923 = HEAP32[$922>>2]|0;
     $$0$i$i$i = $923;
    }
    $924 = ((($920)) + -47|0);
    $925 = ((($924)) + 8|0);
    $926 = $925;
    $927 = $926 & 7;
    $928 = ($927|0)==(0);
    $929 = (0 - ($926))|0;
    $930 = $929 & 7;
    $931 = $928 ? 0 : $930;
    $932 = (($924) + ($931)|0);
    $933 = ((($630)) + 16|0);
    $934 = ($932>>>0)<($933>>>0);
    $935 = $934 ? $630 : $932;
    $936 = ((($935)) + 8|0);
    $937 = ((($935)) + 24|0);
    $938 = (($$723948$i) + -40)|0;
    $939 = ((($$749$i)) + 8|0);
    $940 = $939;
    $941 = $940 & 7;
    $942 = ($941|0)==(0);
    $943 = (0 - ($940))|0;
    $944 = $943 & 7;
    $945 = $942 ? 0 : $944;
    $946 = (($$749$i) + ($945)|0);
    $947 = (($938) - ($945))|0;
    HEAP32[(6880)>>2] = $946;
    HEAP32[(6868)>>2] = $947;
    $948 = $947 | 1;
    $949 = ((($946)) + 4|0);
    HEAP32[$949>>2] = $948;
    $950 = (($946) + ($947)|0);
    $951 = ((($950)) + 4|0);
    HEAP32[$951>>2] = 40;
    $952 = HEAP32[(7344)>>2]|0;
    HEAP32[(6884)>>2] = $952;
    $953 = ((($935)) + 4|0);
    HEAP32[$953>>2] = 27;
    ;HEAP32[$936>>2]=HEAP32[(7304)>>2]|0;HEAP32[$936+4>>2]=HEAP32[(7304)+4>>2]|0;HEAP32[$936+8>>2]=HEAP32[(7304)+8>>2]|0;HEAP32[$936+12>>2]=HEAP32[(7304)+12>>2]|0;
    HEAP32[(7304)>>2] = $$749$i;
    HEAP32[(7308)>>2] = $$723948$i;
    HEAP32[(7316)>>2] = 0;
    HEAP32[(7312)>>2] = $936;
    $955 = $937;
    while(1) {
     $954 = ((($955)) + 4|0);
     HEAP32[$954>>2] = 7;
     $956 = ((($955)) + 8|0);
     $957 = ($956>>>0)<($920>>>0);
     if ($957) {
      $955 = $954;
     } else {
      break;
     }
    }
    $958 = ($935|0)==($630|0);
    if (!($958)) {
     $959 = $935;
     $960 = $630;
     $961 = (($959) - ($960))|0;
     $962 = HEAP32[$953>>2]|0;
     $963 = $962 & -2;
     HEAP32[$953>>2] = $963;
     $964 = $961 | 1;
     $965 = ((($630)) + 4|0);
     HEAP32[$965>>2] = $964;
     HEAP32[$935>>2] = $961;
     $966 = $961 >>> 3;
     $967 = ($961>>>0)<(256);
     if ($967) {
      $968 = $966 << 1;
      $969 = (6896 + ($968<<2)|0);
      $970 = HEAP32[1714]|0;
      $971 = 1 << $966;
      $972 = $970 & $971;
      $973 = ($972|0)==(0);
      if ($973) {
       $974 = $970 | $971;
       HEAP32[1714] = $974;
       $$pre$i$i = ((($969)) + 8|0);
       $$0211$i$i = $969;$$pre$phi$i$iZ2D = $$pre$i$i;
      } else {
       $975 = ((($969)) + 8|0);
       $976 = HEAP32[$975>>2]|0;
       $977 = HEAP32[(6872)>>2]|0;
       $978 = ($976>>>0)<($977>>>0);
       if ($978) {
        _abort();
        // unreachable;
       } else {
        $$0211$i$i = $976;$$pre$phi$i$iZ2D = $975;
       }
      }
      HEAP32[$$pre$phi$i$iZ2D>>2] = $630;
      $979 = ((($$0211$i$i)) + 12|0);
      HEAP32[$979>>2] = $630;
      $980 = ((($630)) + 8|0);
      HEAP32[$980>>2] = $$0211$i$i;
      $981 = ((($630)) + 12|0);
      HEAP32[$981>>2] = $969;
      break;
     }
     $982 = $961 >>> 8;
     $983 = ($982|0)==(0);
     if ($983) {
      $$0212$i$i = 0;
     } else {
      $984 = ($961>>>0)>(16777215);
      if ($984) {
       $$0212$i$i = 31;
      } else {
       $985 = (($982) + 1048320)|0;
       $986 = $985 >>> 16;
       $987 = $986 & 8;
       $988 = $982 << $987;
       $989 = (($988) + 520192)|0;
       $990 = $989 >>> 16;
       $991 = $990 & 4;
       $992 = $991 | $987;
       $993 = $988 << $991;
       $994 = (($993) + 245760)|0;
       $995 = $994 >>> 16;
       $996 = $995 & 2;
       $997 = $992 | $996;
       $998 = (14 - ($997))|0;
       $999 = $993 << $996;
       $1000 = $999 >>> 15;
       $1001 = (($998) + ($1000))|0;
       $1002 = $1001 << 1;
       $1003 = (($1001) + 7)|0;
       $1004 = $961 >>> $1003;
       $1005 = $1004 & 1;
       $1006 = $1005 | $1002;
       $$0212$i$i = $1006;
      }
     }
     $1007 = (7160 + ($$0212$i$i<<2)|0);
     $1008 = ((($630)) + 28|0);
     HEAP32[$1008>>2] = $$0212$i$i;
     $1009 = ((($630)) + 20|0);
     HEAP32[$1009>>2] = 0;
     HEAP32[$933>>2] = 0;
     $1010 = HEAP32[(6860)>>2]|0;
     $1011 = 1 << $$0212$i$i;
     $1012 = $1010 & $1011;
     $1013 = ($1012|0)==(0);
     if ($1013) {
      $1014 = $1010 | $1011;
      HEAP32[(6860)>>2] = $1014;
      HEAP32[$1007>>2] = $630;
      $1015 = ((($630)) + 24|0);
      HEAP32[$1015>>2] = $1007;
      $1016 = ((($630)) + 12|0);
      HEAP32[$1016>>2] = $630;
      $1017 = ((($630)) + 8|0);
      HEAP32[$1017>>2] = $630;
      break;
     }
     $1018 = HEAP32[$1007>>2]|0;
     $1019 = ($$0212$i$i|0)==(31);
     $1020 = $$0212$i$i >>> 1;
     $1021 = (25 - ($1020))|0;
     $1022 = $1019 ? 0 : $1021;
     $1023 = $961 << $1022;
     $$0206$i$i = $1023;$$0207$i$i = $1018;
     while(1) {
      $1024 = ((($$0207$i$i)) + 4|0);
      $1025 = HEAP32[$1024>>2]|0;
      $1026 = $1025 & -8;
      $1027 = ($1026|0)==($961|0);
      if ($1027) {
       label = 292;
       break;
      }
      $1028 = $$0206$i$i >>> 31;
      $1029 = (((($$0207$i$i)) + 16|0) + ($1028<<2)|0);
      $1030 = $$0206$i$i << 1;
      $1031 = HEAP32[$1029>>2]|0;
      $1032 = ($1031|0)==(0|0);
      if ($1032) {
       label = 289;
       break;
      } else {
       $$0206$i$i = $1030;$$0207$i$i = $1031;
      }
     }
     if ((label|0) == 289) {
      $1033 = HEAP32[(6872)>>2]|0;
      $1034 = ($1029>>>0)<($1033>>>0);
      if ($1034) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$1029>>2] = $630;
       $1035 = ((($630)) + 24|0);
       HEAP32[$1035>>2] = $$0207$i$i;
       $1036 = ((($630)) + 12|0);
       HEAP32[$1036>>2] = $630;
       $1037 = ((($630)) + 8|0);
       HEAP32[$1037>>2] = $630;
       break;
      }
     }
     else if ((label|0) == 292) {
      $1038 = ((($$0207$i$i)) + 8|0);
      $1039 = HEAP32[$1038>>2]|0;
      $1040 = HEAP32[(6872)>>2]|0;
      $1041 = ($1039>>>0)>=($1040>>>0);
      $not$$i$i = ($$0207$i$i>>>0)>=($1040>>>0);
      $1042 = $1041 & $not$$i$i;
      if ($1042) {
       $1043 = ((($1039)) + 12|0);
       HEAP32[$1043>>2] = $630;
       HEAP32[$1038>>2] = $630;
       $1044 = ((($630)) + 8|0);
       HEAP32[$1044>>2] = $1039;
       $1045 = ((($630)) + 12|0);
       HEAP32[$1045>>2] = $$0207$i$i;
       $1046 = ((($630)) + 24|0);
       HEAP32[$1046>>2] = 0;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    }
   }
  } while(0);
  $1048 = HEAP32[(6868)>>2]|0;
  $1049 = ($1048>>>0)>($$0197>>>0);
  if ($1049) {
   $1050 = (($1048) - ($$0197))|0;
   HEAP32[(6868)>>2] = $1050;
   $1051 = HEAP32[(6880)>>2]|0;
   $1052 = (($1051) + ($$0197)|0);
   HEAP32[(6880)>>2] = $1052;
   $1053 = $1050 | 1;
   $1054 = ((($1052)) + 4|0);
   HEAP32[$1054>>2] = $1053;
   $1055 = $$0197 | 3;
   $1056 = ((($1051)) + 4|0);
   HEAP32[$1056>>2] = $1055;
   $1057 = ((($1051)) + 8|0);
   $$0 = $1057;
   STACKTOP = sp;return ($$0|0);
  }
 }
 $1058 = (___errno_location()|0);
 HEAP32[$1058>>2] = 12;
 $$0 = 0;
 STACKTOP = sp;return ($$0|0);
}
function _free($0) {
 $0 = $0|0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre = 0, $$pre$phi443Z2D = 0, $$pre$phi445Z2D = 0, $$pre$phiZ2D = 0, $$pre442 = 0;
 var $$pre444 = 0, $$sink3 = 0, $$sink5 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0;
 var $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0;
 var $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0;
 var $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0;
 var $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0;
 var $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0;
 var $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0;
 var $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0;
 var $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0;
 var $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0;
 var $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0;
 var $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0;
 var $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0;
 var $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0;
 var $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0;
 var $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0;
 var $99 = 0, $cond421 = 0, $cond422 = 0, $not$ = 0, $not$405 = 0, $not$437 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 if ($1) {
  return;
 }
 $2 = ((($0)) + -8|0);
 $3 = HEAP32[(6872)>>2]|0;
 $4 = ($2>>>0)<($3>>>0);
 if ($4) {
  _abort();
  // unreachable;
 }
 $5 = ((($0)) + -4|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = $6 & 3;
 $8 = ($7|0)==(1);
 if ($8) {
  _abort();
  // unreachable;
 }
 $9 = $6 & -8;
 $10 = (($2) + ($9)|0);
 $11 = $6 & 1;
 $12 = ($11|0)==(0);
 L10: do {
  if ($12) {
   $13 = HEAP32[$2>>2]|0;
   $14 = ($7|0)==(0);
   if ($14) {
    return;
   }
   $15 = (0 - ($13))|0;
   $16 = (($2) + ($15)|0);
   $17 = (($13) + ($9))|0;
   $18 = ($16>>>0)<($3>>>0);
   if ($18) {
    _abort();
    // unreachable;
   }
   $19 = HEAP32[(6876)>>2]|0;
   $20 = ($16|0)==($19|0);
   if ($20) {
    $104 = ((($10)) + 4|0);
    $105 = HEAP32[$104>>2]|0;
    $106 = $105 & 3;
    $107 = ($106|0)==(3);
    if (!($107)) {
     $$1 = $16;$$1382 = $17;$112 = $16;
     break;
    }
    $108 = (($16) + ($17)|0);
    $109 = ((($16)) + 4|0);
    $110 = $17 | 1;
    $111 = $105 & -2;
    HEAP32[(6864)>>2] = $17;
    HEAP32[$104>>2] = $111;
    HEAP32[$109>>2] = $110;
    HEAP32[$108>>2] = $17;
    return;
   }
   $21 = $13 >>> 3;
   $22 = ($13>>>0)<(256);
   if ($22) {
    $23 = ((($16)) + 8|0);
    $24 = HEAP32[$23>>2]|0;
    $25 = ((($16)) + 12|0);
    $26 = HEAP32[$25>>2]|0;
    $27 = $21 << 1;
    $28 = (6896 + ($27<<2)|0);
    $29 = ($24|0)==($28|0);
    if (!($29)) {
     $30 = ($24>>>0)<($3>>>0);
     if ($30) {
      _abort();
      // unreachable;
     }
     $31 = ((($24)) + 12|0);
     $32 = HEAP32[$31>>2]|0;
     $33 = ($32|0)==($16|0);
     if (!($33)) {
      _abort();
      // unreachable;
     }
    }
    $34 = ($26|0)==($24|0);
    if ($34) {
     $35 = 1 << $21;
     $36 = $35 ^ -1;
     $37 = HEAP32[1714]|0;
     $38 = $37 & $36;
     HEAP32[1714] = $38;
     $$1 = $16;$$1382 = $17;$112 = $16;
     break;
    }
    $39 = ($26|0)==($28|0);
    if ($39) {
     $$pre444 = ((($26)) + 8|0);
     $$pre$phi445Z2D = $$pre444;
    } else {
     $40 = ($26>>>0)<($3>>>0);
     if ($40) {
      _abort();
      // unreachable;
     }
     $41 = ((($26)) + 8|0);
     $42 = HEAP32[$41>>2]|0;
     $43 = ($42|0)==($16|0);
     if ($43) {
      $$pre$phi445Z2D = $41;
     } else {
      _abort();
      // unreachable;
     }
    }
    $44 = ((($24)) + 12|0);
    HEAP32[$44>>2] = $26;
    HEAP32[$$pre$phi445Z2D>>2] = $24;
    $$1 = $16;$$1382 = $17;$112 = $16;
    break;
   }
   $45 = ((($16)) + 24|0);
   $46 = HEAP32[$45>>2]|0;
   $47 = ((($16)) + 12|0);
   $48 = HEAP32[$47>>2]|0;
   $49 = ($48|0)==($16|0);
   do {
    if ($49) {
     $59 = ((($16)) + 16|0);
     $60 = ((($59)) + 4|0);
     $61 = HEAP32[$60>>2]|0;
     $62 = ($61|0)==(0|0);
     if ($62) {
      $63 = HEAP32[$59>>2]|0;
      $64 = ($63|0)==(0|0);
      if ($64) {
       $$3 = 0;
       break;
      } else {
       $$1387 = $63;$$1390 = $59;
      }
     } else {
      $$1387 = $61;$$1390 = $60;
     }
     while(1) {
      $65 = ((($$1387)) + 20|0);
      $66 = HEAP32[$65>>2]|0;
      $67 = ($66|0)==(0|0);
      if (!($67)) {
       $$1387 = $66;$$1390 = $65;
       continue;
      }
      $68 = ((($$1387)) + 16|0);
      $69 = HEAP32[$68>>2]|0;
      $70 = ($69|0)==(0|0);
      if ($70) {
       break;
      } else {
       $$1387 = $69;$$1390 = $68;
      }
     }
     $71 = ($$1390>>>0)<($3>>>0);
     if ($71) {
      _abort();
      // unreachable;
     } else {
      HEAP32[$$1390>>2] = 0;
      $$3 = $$1387;
      break;
     }
    } else {
     $50 = ((($16)) + 8|0);
     $51 = HEAP32[$50>>2]|0;
     $52 = ($51>>>0)<($3>>>0);
     if ($52) {
      _abort();
      // unreachable;
     }
     $53 = ((($51)) + 12|0);
     $54 = HEAP32[$53>>2]|0;
     $55 = ($54|0)==($16|0);
     if (!($55)) {
      _abort();
      // unreachable;
     }
     $56 = ((($48)) + 8|0);
     $57 = HEAP32[$56>>2]|0;
     $58 = ($57|0)==($16|0);
     if ($58) {
      HEAP32[$53>>2] = $48;
      HEAP32[$56>>2] = $51;
      $$3 = $48;
      break;
     } else {
      _abort();
      // unreachable;
     }
    }
   } while(0);
   $72 = ($46|0)==(0|0);
   if ($72) {
    $$1 = $16;$$1382 = $17;$112 = $16;
   } else {
    $73 = ((($16)) + 28|0);
    $74 = HEAP32[$73>>2]|0;
    $75 = (7160 + ($74<<2)|0);
    $76 = HEAP32[$75>>2]|0;
    $77 = ($16|0)==($76|0);
    do {
     if ($77) {
      HEAP32[$75>>2] = $$3;
      $cond421 = ($$3|0)==(0|0);
      if ($cond421) {
       $78 = 1 << $74;
       $79 = $78 ^ -1;
       $80 = HEAP32[(6860)>>2]|0;
       $81 = $80 & $79;
       HEAP32[(6860)>>2] = $81;
       $$1 = $16;$$1382 = $17;$112 = $16;
       break L10;
      }
     } else {
      $82 = HEAP32[(6872)>>2]|0;
      $83 = ($46>>>0)<($82>>>0);
      if ($83) {
       _abort();
       // unreachable;
      } else {
       $84 = ((($46)) + 16|0);
       $85 = HEAP32[$84>>2]|0;
       $not$405 = ($85|0)!=($16|0);
       $$sink3 = $not$405&1;
       $86 = (((($46)) + 16|0) + ($$sink3<<2)|0);
       HEAP32[$86>>2] = $$3;
       $87 = ($$3|0)==(0|0);
       if ($87) {
        $$1 = $16;$$1382 = $17;$112 = $16;
        break L10;
       } else {
        break;
       }
      }
     }
    } while(0);
    $88 = HEAP32[(6872)>>2]|0;
    $89 = ($$3>>>0)<($88>>>0);
    if ($89) {
     _abort();
     // unreachable;
    }
    $90 = ((($$3)) + 24|0);
    HEAP32[$90>>2] = $46;
    $91 = ((($16)) + 16|0);
    $92 = HEAP32[$91>>2]|0;
    $93 = ($92|0)==(0|0);
    do {
     if (!($93)) {
      $94 = ($92>>>0)<($88>>>0);
      if ($94) {
       _abort();
       // unreachable;
      } else {
       $95 = ((($$3)) + 16|0);
       HEAP32[$95>>2] = $92;
       $96 = ((($92)) + 24|0);
       HEAP32[$96>>2] = $$3;
       break;
      }
     }
    } while(0);
    $97 = ((($91)) + 4|0);
    $98 = HEAP32[$97>>2]|0;
    $99 = ($98|0)==(0|0);
    if ($99) {
     $$1 = $16;$$1382 = $17;$112 = $16;
    } else {
     $100 = HEAP32[(6872)>>2]|0;
     $101 = ($98>>>0)<($100>>>0);
     if ($101) {
      _abort();
      // unreachable;
     } else {
      $102 = ((($$3)) + 20|0);
      HEAP32[$102>>2] = $98;
      $103 = ((($98)) + 24|0);
      HEAP32[$103>>2] = $$3;
      $$1 = $16;$$1382 = $17;$112 = $16;
      break;
     }
    }
   }
  } else {
   $$1 = $2;$$1382 = $9;$112 = $2;
  }
 } while(0);
 $113 = ($112>>>0)<($10>>>0);
 if (!($113)) {
  _abort();
  // unreachable;
 }
 $114 = ((($10)) + 4|0);
 $115 = HEAP32[$114>>2]|0;
 $116 = $115 & 1;
 $117 = ($116|0)==(0);
 if ($117) {
  _abort();
  // unreachable;
 }
 $118 = $115 & 2;
 $119 = ($118|0)==(0);
 if ($119) {
  $120 = HEAP32[(6880)>>2]|0;
  $121 = ($10|0)==($120|0);
  $122 = HEAP32[(6876)>>2]|0;
  if ($121) {
   $123 = HEAP32[(6868)>>2]|0;
   $124 = (($123) + ($$1382))|0;
   HEAP32[(6868)>>2] = $124;
   HEAP32[(6880)>>2] = $$1;
   $125 = $124 | 1;
   $126 = ((($$1)) + 4|0);
   HEAP32[$126>>2] = $125;
   $127 = ($$1|0)==($122|0);
   if (!($127)) {
    return;
   }
   HEAP32[(6876)>>2] = 0;
   HEAP32[(6864)>>2] = 0;
   return;
  }
  $128 = ($10|0)==($122|0);
  if ($128) {
   $129 = HEAP32[(6864)>>2]|0;
   $130 = (($129) + ($$1382))|0;
   HEAP32[(6864)>>2] = $130;
   HEAP32[(6876)>>2] = $112;
   $131 = $130 | 1;
   $132 = ((($$1)) + 4|0);
   HEAP32[$132>>2] = $131;
   $133 = (($112) + ($130)|0);
   HEAP32[$133>>2] = $130;
   return;
  }
  $134 = $115 & -8;
  $135 = (($134) + ($$1382))|0;
  $136 = $115 >>> 3;
  $137 = ($115>>>0)<(256);
  L108: do {
   if ($137) {
    $138 = ((($10)) + 8|0);
    $139 = HEAP32[$138>>2]|0;
    $140 = ((($10)) + 12|0);
    $141 = HEAP32[$140>>2]|0;
    $142 = $136 << 1;
    $143 = (6896 + ($142<<2)|0);
    $144 = ($139|0)==($143|0);
    if (!($144)) {
     $145 = HEAP32[(6872)>>2]|0;
     $146 = ($139>>>0)<($145>>>0);
     if ($146) {
      _abort();
      // unreachable;
     }
     $147 = ((($139)) + 12|0);
     $148 = HEAP32[$147>>2]|0;
     $149 = ($148|0)==($10|0);
     if (!($149)) {
      _abort();
      // unreachable;
     }
    }
    $150 = ($141|0)==($139|0);
    if ($150) {
     $151 = 1 << $136;
     $152 = $151 ^ -1;
     $153 = HEAP32[1714]|0;
     $154 = $153 & $152;
     HEAP32[1714] = $154;
     break;
    }
    $155 = ($141|0)==($143|0);
    if ($155) {
     $$pre442 = ((($141)) + 8|0);
     $$pre$phi443Z2D = $$pre442;
    } else {
     $156 = HEAP32[(6872)>>2]|0;
     $157 = ($141>>>0)<($156>>>0);
     if ($157) {
      _abort();
      // unreachable;
     }
     $158 = ((($141)) + 8|0);
     $159 = HEAP32[$158>>2]|0;
     $160 = ($159|0)==($10|0);
     if ($160) {
      $$pre$phi443Z2D = $158;
     } else {
      _abort();
      // unreachable;
     }
    }
    $161 = ((($139)) + 12|0);
    HEAP32[$161>>2] = $141;
    HEAP32[$$pre$phi443Z2D>>2] = $139;
   } else {
    $162 = ((($10)) + 24|0);
    $163 = HEAP32[$162>>2]|0;
    $164 = ((($10)) + 12|0);
    $165 = HEAP32[$164>>2]|0;
    $166 = ($165|0)==($10|0);
    do {
     if ($166) {
      $177 = ((($10)) + 16|0);
      $178 = ((($177)) + 4|0);
      $179 = HEAP32[$178>>2]|0;
      $180 = ($179|0)==(0|0);
      if ($180) {
       $181 = HEAP32[$177>>2]|0;
       $182 = ($181|0)==(0|0);
       if ($182) {
        $$3400 = 0;
        break;
       } else {
        $$1398 = $181;$$1402 = $177;
       }
      } else {
       $$1398 = $179;$$1402 = $178;
      }
      while(1) {
       $183 = ((($$1398)) + 20|0);
       $184 = HEAP32[$183>>2]|0;
       $185 = ($184|0)==(0|0);
       if (!($185)) {
        $$1398 = $184;$$1402 = $183;
        continue;
       }
       $186 = ((($$1398)) + 16|0);
       $187 = HEAP32[$186>>2]|0;
       $188 = ($187|0)==(0|0);
       if ($188) {
        break;
       } else {
        $$1398 = $187;$$1402 = $186;
       }
      }
      $189 = HEAP32[(6872)>>2]|0;
      $190 = ($$1402>>>0)<($189>>>0);
      if ($190) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$$1402>>2] = 0;
       $$3400 = $$1398;
       break;
      }
     } else {
      $167 = ((($10)) + 8|0);
      $168 = HEAP32[$167>>2]|0;
      $169 = HEAP32[(6872)>>2]|0;
      $170 = ($168>>>0)<($169>>>0);
      if ($170) {
       _abort();
       // unreachable;
      }
      $171 = ((($168)) + 12|0);
      $172 = HEAP32[$171>>2]|0;
      $173 = ($172|0)==($10|0);
      if (!($173)) {
       _abort();
       // unreachable;
      }
      $174 = ((($165)) + 8|0);
      $175 = HEAP32[$174>>2]|0;
      $176 = ($175|0)==($10|0);
      if ($176) {
       HEAP32[$171>>2] = $165;
       HEAP32[$174>>2] = $168;
       $$3400 = $165;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $191 = ($163|0)==(0|0);
    if (!($191)) {
     $192 = ((($10)) + 28|0);
     $193 = HEAP32[$192>>2]|0;
     $194 = (7160 + ($193<<2)|0);
     $195 = HEAP32[$194>>2]|0;
     $196 = ($10|0)==($195|0);
     do {
      if ($196) {
       HEAP32[$194>>2] = $$3400;
       $cond422 = ($$3400|0)==(0|0);
       if ($cond422) {
        $197 = 1 << $193;
        $198 = $197 ^ -1;
        $199 = HEAP32[(6860)>>2]|0;
        $200 = $199 & $198;
        HEAP32[(6860)>>2] = $200;
        break L108;
       }
      } else {
       $201 = HEAP32[(6872)>>2]|0;
       $202 = ($163>>>0)<($201>>>0);
       if ($202) {
        _abort();
        // unreachable;
       } else {
        $203 = ((($163)) + 16|0);
        $204 = HEAP32[$203>>2]|0;
        $not$ = ($204|0)!=($10|0);
        $$sink5 = $not$&1;
        $205 = (((($163)) + 16|0) + ($$sink5<<2)|0);
        HEAP32[$205>>2] = $$3400;
        $206 = ($$3400|0)==(0|0);
        if ($206) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while(0);
     $207 = HEAP32[(6872)>>2]|0;
     $208 = ($$3400>>>0)<($207>>>0);
     if ($208) {
      _abort();
      // unreachable;
     }
     $209 = ((($$3400)) + 24|0);
     HEAP32[$209>>2] = $163;
     $210 = ((($10)) + 16|0);
     $211 = HEAP32[$210>>2]|0;
     $212 = ($211|0)==(0|0);
     do {
      if (!($212)) {
       $213 = ($211>>>0)<($207>>>0);
       if ($213) {
        _abort();
        // unreachable;
       } else {
        $214 = ((($$3400)) + 16|0);
        HEAP32[$214>>2] = $211;
        $215 = ((($211)) + 24|0);
        HEAP32[$215>>2] = $$3400;
        break;
       }
      }
     } while(0);
     $216 = ((($210)) + 4|0);
     $217 = HEAP32[$216>>2]|0;
     $218 = ($217|0)==(0|0);
     if (!($218)) {
      $219 = HEAP32[(6872)>>2]|0;
      $220 = ($217>>>0)<($219>>>0);
      if ($220) {
       _abort();
       // unreachable;
      } else {
       $221 = ((($$3400)) + 20|0);
       HEAP32[$221>>2] = $217;
       $222 = ((($217)) + 24|0);
       HEAP32[$222>>2] = $$3400;
       break;
      }
     }
    }
   }
  } while(0);
  $223 = $135 | 1;
  $224 = ((($$1)) + 4|0);
  HEAP32[$224>>2] = $223;
  $225 = (($112) + ($135)|0);
  HEAP32[$225>>2] = $135;
  $226 = HEAP32[(6876)>>2]|0;
  $227 = ($$1|0)==($226|0);
  if ($227) {
   HEAP32[(6864)>>2] = $135;
   return;
  } else {
   $$2 = $135;
  }
 } else {
  $228 = $115 & -2;
  HEAP32[$114>>2] = $228;
  $229 = $$1382 | 1;
  $230 = ((($$1)) + 4|0);
  HEAP32[$230>>2] = $229;
  $231 = (($112) + ($$1382)|0);
  HEAP32[$231>>2] = $$1382;
  $$2 = $$1382;
 }
 $232 = $$2 >>> 3;
 $233 = ($$2>>>0)<(256);
 if ($233) {
  $234 = $232 << 1;
  $235 = (6896 + ($234<<2)|0);
  $236 = HEAP32[1714]|0;
  $237 = 1 << $232;
  $238 = $236 & $237;
  $239 = ($238|0)==(0);
  if ($239) {
   $240 = $236 | $237;
   HEAP32[1714] = $240;
   $$pre = ((($235)) + 8|0);
   $$0403 = $235;$$pre$phiZ2D = $$pre;
  } else {
   $241 = ((($235)) + 8|0);
   $242 = HEAP32[$241>>2]|0;
   $243 = HEAP32[(6872)>>2]|0;
   $244 = ($242>>>0)<($243>>>0);
   if ($244) {
    _abort();
    // unreachable;
   } else {
    $$0403 = $242;$$pre$phiZ2D = $241;
   }
  }
  HEAP32[$$pre$phiZ2D>>2] = $$1;
  $245 = ((($$0403)) + 12|0);
  HEAP32[$245>>2] = $$1;
  $246 = ((($$1)) + 8|0);
  HEAP32[$246>>2] = $$0403;
  $247 = ((($$1)) + 12|0);
  HEAP32[$247>>2] = $235;
  return;
 }
 $248 = $$2 >>> 8;
 $249 = ($248|0)==(0);
 if ($249) {
  $$0396 = 0;
 } else {
  $250 = ($$2>>>0)>(16777215);
  if ($250) {
   $$0396 = 31;
  } else {
   $251 = (($248) + 1048320)|0;
   $252 = $251 >>> 16;
   $253 = $252 & 8;
   $254 = $248 << $253;
   $255 = (($254) + 520192)|0;
   $256 = $255 >>> 16;
   $257 = $256 & 4;
   $258 = $257 | $253;
   $259 = $254 << $257;
   $260 = (($259) + 245760)|0;
   $261 = $260 >>> 16;
   $262 = $261 & 2;
   $263 = $258 | $262;
   $264 = (14 - ($263))|0;
   $265 = $259 << $262;
   $266 = $265 >>> 15;
   $267 = (($264) + ($266))|0;
   $268 = $267 << 1;
   $269 = (($267) + 7)|0;
   $270 = $$2 >>> $269;
   $271 = $270 & 1;
   $272 = $271 | $268;
   $$0396 = $272;
  }
 }
 $273 = (7160 + ($$0396<<2)|0);
 $274 = ((($$1)) + 28|0);
 HEAP32[$274>>2] = $$0396;
 $275 = ((($$1)) + 16|0);
 $276 = ((($$1)) + 20|0);
 HEAP32[$276>>2] = 0;
 HEAP32[$275>>2] = 0;
 $277 = HEAP32[(6860)>>2]|0;
 $278 = 1 << $$0396;
 $279 = $277 & $278;
 $280 = ($279|0)==(0);
 do {
  if ($280) {
   $281 = $277 | $278;
   HEAP32[(6860)>>2] = $281;
   HEAP32[$273>>2] = $$1;
   $282 = ((($$1)) + 24|0);
   HEAP32[$282>>2] = $273;
   $283 = ((($$1)) + 12|0);
   HEAP32[$283>>2] = $$1;
   $284 = ((($$1)) + 8|0);
   HEAP32[$284>>2] = $$1;
  } else {
   $285 = HEAP32[$273>>2]|0;
   $286 = ($$0396|0)==(31);
   $287 = $$0396 >>> 1;
   $288 = (25 - ($287))|0;
   $289 = $286 ? 0 : $288;
   $290 = $$2 << $289;
   $$0383 = $290;$$0384 = $285;
   while(1) {
    $291 = ((($$0384)) + 4|0);
    $292 = HEAP32[$291>>2]|0;
    $293 = $292 & -8;
    $294 = ($293|0)==($$2|0);
    if ($294) {
     label = 124;
     break;
    }
    $295 = $$0383 >>> 31;
    $296 = (((($$0384)) + 16|0) + ($295<<2)|0);
    $297 = $$0383 << 1;
    $298 = HEAP32[$296>>2]|0;
    $299 = ($298|0)==(0|0);
    if ($299) {
     label = 121;
     break;
    } else {
     $$0383 = $297;$$0384 = $298;
    }
   }
   if ((label|0) == 121) {
    $300 = HEAP32[(6872)>>2]|0;
    $301 = ($296>>>0)<($300>>>0);
    if ($301) {
     _abort();
     // unreachable;
    } else {
     HEAP32[$296>>2] = $$1;
     $302 = ((($$1)) + 24|0);
     HEAP32[$302>>2] = $$0384;
     $303 = ((($$1)) + 12|0);
     HEAP32[$303>>2] = $$1;
     $304 = ((($$1)) + 8|0);
     HEAP32[$304>>2] = $$1;
     break;
    }
   }
   else if ((label|0) == 124) {
    $305 = ((($$0384)) + 8|0);
    $306 = HEAP32[$305>>2]|0;
    $307 = HEAP32[(6872)>>2]|0;
    $308 = ($306>>>0)>=($307>>>0);
    $not$437 = ($$0384>>>0)>=($307>>>0);
    $309 = $308 & $not$437;
    if ($309) {
     $310 = ((($306)) + 12|0);
     HEAP32[$310>>2] = $$1;
     HEAP32[$305>>2] = $$1;
     $311 = ((($$1)) + 8|0);
     HEAP32[$311>>2] = $306;
     $312 = ((($$1)) + 12|0);
     HEAP32[$312>>2] = $$0384;
     $313 = ((($$1)) + 24|0);
     HEAP32[$313>>2] = 0;
     break;
    } else {
     _abort();
     // unreachable;
    }
   }
  }
 } while(0);
 $314 = HEAP32[(6888)>>2]|0;
 $315 = (($314) + -1)|0;
 HEAP32[(6888)>>2] = $315;
 $316 = ($315|0)==(0);
 if ($316) {
  $$0212$in$i = (7312);
 } else {
  return;
 }
 while(1) {
  $$0212$i = HEAP32[$$0212$in$i>>2]|0;
  $317 = ($$0212$i|0)==(0|0);
  $318 = ((($$0212$i)) + 8|0);
  if ($317) {
   break;
  } else {
   $$0212$in$i = $318;
  }
 }
 HEAP32[(6888)>>2] = -1;
 return;
}
function __ZNKSt3__220__vector_base_commonILb1EE20__throw_length_errorEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (___cxa_allocate_exception(8)|0);
 __THREW__ = 0;
 invoke_vii(114,($1|0),(5878|0));
 $2 = __THREW__; __THREW__ = 0;
 $3 = $2&1;
 if ($3) {
  $4 = ___cxa_find_matching_catch_2()|0;
  $5 = tempRet0;
  ___cxa_free_exception(($1|0));
  ___resumeException($4|0);
  // unreachable;
 } else {
  HEAP32[$1>>2] = (1516);
  ___cxa_throw(($1|0),(392|0),(21|0));
  // unreachable;
 }
}
function __ZNSt3__211char_traitsIcE7compareEPKcS3_j($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($2|0)==(0);
 if ($3) {
  $5 = 0;
 } else {
  $4 = (_memcmp($0,$1,$2)|0);
  $5 = $4;
 }
 return ($5|0);
}
function __Znwj($0) {
 $0 = $0|0;
 var $$ = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0);
 $$ = $1 ? 1 : $0;
 while(1) {
  $2 = (_malloc($$)|0);
  $3 = ($2|0)==(0|0);
  if (!($3)) {
   label = 6;
   break;
  }
  $4 = (__ZSt15get_new_handlerv()|0);
  $5 = ($4|0)==(0|0);
  if ($5) {
   label = 5;
   break;
  }
  FUNCTION_TABLE_v[$4 & 127]();
 }
 if ((label|0) == 5) {
  $6 = (___cxa_allocate_exception(4)|0);
  __ZNSt9bad_allocC2Ev($6);
  ___cxa_throw(($6|0),(360|0),(18|0));
  // unreachable;
 }
 else if ((label|0) == 6) {
  return ($2|0);
 }
 return (0)|0;
}
function __Znaj($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (__Znwj($0)|0);
 return ($1|0);
}
function __ZdlPv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 _free($0);
 return;
}
function __ZdaPv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZdlPv($0);
 return;
}
function __ZNSt3__218__libcpp_refstringC2EPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (_strlen($1)|0);
 $3 = (($2) + 13)|0;
 $4 = (__Znwj($3)|0);
 HEAP32[$4>>2] = $2;
 $5 = ((($4)) + 4|0);
 HEAP32[$5>>2] = $2;
 $6 = ((($4)) + 8|0);
 HEAP32[$6>>2] = 0;
 $7 = ((($4)) + 12|0);
 $8 = (($2) + 1)|0;
 _memcpy(($7|0),($1|0),($8|0))|0;
 HEAP32[$0>>2] = $7;
 return;
}
function __ZNSt11logic_errorC2EPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = (1496);
 $2 = ((($0)) + 4|0);
 __THREW__ = 0;
 invoke_vii(115,($2|0),($1|0));
 $3 = __THREW__; __THREW__ = 0;
 $4 = $3&1;
 if ($4) {
  $5 = ___cxa_find_matching_catch_2()|0;
  $6 = tempRet0;
  ___resumeException($5|0);
  // unreachable;
 } else {
  return;
 }
}
function __ZNKSt3__221__basic_string_commonILb1EE20__throw_length_errorEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (___cxa_allocate_exception(8)|0);
 __THREW__ = 0;
 invoke_vii(114,($1|0),(5885|0));
 $2 = __THREW__; __THREW__ = 0;
 $3 = $2&1;
 if ($3) {
  $4 = ___cxa_find_matching_catch_2()|0;
  $5 = tempRet0;
  ___cxa_free_exception(($1|0));
  ___resumeException($4|0);
  // unreachable;
 } else {
  HEAP32[$1>>2] = (1516);
  ___cxa_throw(($1|0),(392|0),(21|0));
  // unreachable;
 }
}
function __ZNKSt3__221__basic_string_commonILb1EE20__throw_out_of_rangeEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (___cxa_allocate_exception(8)|0);
 __THREW__ = 0;
 invoke_vii(114,($1|0),(5885|0));
 $2 = __THREW__; __THREW__ = 0;
 $3 = $2&1;
 if ($3) {
  $4 = ___cxa_find_matching_catch_2()|0;
  $5 = tempRet0;
  ___cxa_free_exception(($1|0));
  ___resumeException($4|0);
  // unreachable;
 } else {
  HEAP32[$1>>2] = (1536);
  ___cxa_throw(($1|0),(408|0),(21|0));
  // unreachable;
 }
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEC2ERKS5_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 ;HEAP32[$0>>2]=0|0;HEAP32[$0+4>>2]=0|0;HEAP32[$0+8>>2]=0|0;
 $2 = ((($1)) + 11|0);
 $3 = HEAP8[$2>>0]|0;
 $4 = ($3<<24>>24)<(0);
 if ($4) {
  $5 = HEAP32[$1>>2]|0;
  $6 = ((($1)) + 4|0);
  $7 = HEAP32[$6>>2]|0;
  __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6__initEPKcj($0,$5,$7);
 } else {
  ;HEAP32[$0>>2]=HEAP32[$1>>2]|0;HEAP32[$0+4>>2]=HEAP32[$1+4>>2]|0;HEAP32[$0+8>>2]=HEAP32[$1+8>>2]|0;
 }
 return;
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6__initEPKcj($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$016 = 0, $$017 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($2>>>0)>(4294967279);
 if ($3) {
  __ZNKSt3__221__basic_string_commonILb1EE20__throw_length_errorEv($0);
  // unreachable;
 }
 $4 = ($2>>>0)<(11);
 if ($4) {
  $11 = $2&255;
  $12 = ((($0)) + 11|0);
  HEAP8[$12>>0] = $11;
  $13 = ($2|0)==(0);
  if ($13) {
   $$017 = $0;
  } else {
   $$016 = $0;
   label = 6;
  }
 } else {
  $5 = (($2) + 16)|0;
  $6 = $5 & -16;
  $7 = (__Znwj($6)|0);
  HEAP32[$0>>2] = $7;
  $8 = $6 | -2147483648;
  $9 = ((($0)) + 8|0);
  HEAP32[$9>>2] = $8;
  $10 = ((($0)) + 4|0);
  HEAP32[$10>>2] = $2;
  $$016 = $7;
  label = 6;
 }
 if ((label|0) == 6) {
  _memcpy(($$016|0),($1|0),($2|0))|0;
  $$017 = $$016;
 }
 $14 = (($$017) + ($2)|0);
 HEAP8[$14>>0] = 0;
 return;
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 11|0);
 $2 = HEAP8[$1>>0]|0;
 $3 = ($2<<24>>24)<(0);
 if ($3) {
  $4 = HEAP32[$0>>2]|0;
  __ZdlPv($4);
 }
 return;
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEaSERKS5_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($0|0)==($1|0);
 if (!($2)) {
  $3 = ((($1)) + 11|0);
  $4 = HEAP8[$3>>0]|0;
  $5 = ($4<<24>>24)<(0);
  $6 = HEAP32[$1>>2]|0;
  $7 = $5 ? $6 : $1;
  $8 = ((($1)) + 4|0);
  $9 = HEAP32[$8>>2]|0;
  $10 = $4&255;
  $11 = $5 ? $9 : $10;
  (__ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6assignEPKcj($0,$7,$11)|0);
 }
 return ($0|0);
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6assignEPKcj($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, $phitmp$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ((($0)) + 11|0);
 $4 = HEAP8[$3>>0]|0;
 $5 = ($4<<24>>24)<(0);
 if ($5) {
  $6 = ((($0)) + 8|0);
  $7 = HEAP32[$6>>2]|0;
  $8 = $7 & 2147483647;
  $phitmp$i = (($8) + -1)|0;
  $9 = $phitmp$i;
 } else {
  $9 = 10;
 }
 $10 = ($9>>>0)<($2>>>0);
 do {
  if ($10) {
   if ($5) {
    $19 = ((($0)) + 4|0);
    $20 = HEAP32[$19>>2]|0;
    $23 = $20;
   } else {
    $21 = $4&255;
    $23 = $21;
   }
   $22 = (($2) - ($9))|0;
   __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE21__grow_by_and_replaceEjjjjjjPKc($0,$9,$22,$23,0,$23,$2,$1);
  } else {
   if ($5) {
    $11 = HEAP32[$0>>2]|0;
    $13 = $11;
   } else {
    $13 = $0;
   }
   $12 = ($2|0)==(0);
   if (!($12)) {
    _memmove(($13|0),($1|0),($2|0))|0;
   }
   $14 = (($13) + ($2)|0);
   HEAP8[$14>>0] = 0;
   $15 = HEAP8[$3>>0]|0;
   $16 = ($15<<24>>24)<(0);
   if ($16) {
    $17 = ((($0)) + 4|0);
    HEAP32[$17>>2] = $2;
    break;
   } else {
    $18 = $2&255;
    HEAP8[$3>>0] = $18;
    break;
   }
  }
 } while(0);
 return ($0|0);
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE21__grow_by_and_replaceEjjjjjjPKc($0,$1,$2,$3,$4,$5,$6,$7) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 $6 = $6|0;
 $7 = $7|0;
 var $$sroa$speculated = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $8 = 0, $9 = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $8 = (-18 - ($1))|0;
 $9 = ($8>>>0)<($2>>>0);
 if ($9) {
  __ZNKSt3__221__basic_string_commonILb1EE20__throw_length_errorEv($0);
  // unreachable;
 }
 $10 = ((($0)) + 11|0);
 $11 = HEAP8[$10>>0]|0;
 $12 = ($11<<24>>24)<(0);
 if ($12) {
  $13 = HEAP32[$0>>2]|0;
  $24 = $13;
 } else {
  $24 = $0;
 }
 $14 = ($1>>>0)<(2147483623);
 if ($14) {
  $15 = (($2) + ($1))|0;
  $16 = $1 << 1;
  $17 = ($15>>>0)<($16>>>0);
  $$sroa$speculated = $17 ? $16 : $15;
  $18 = ($$sroa$speculated>>>0)<(11);
  $19 = (($$sroa$speculated) + 16)|0;
  $20 = $19 & -16;
  $phitmp = $18 ? 11 : $20;
  $21 = $phitmp;
 } else {
  $21 = -17;
 }
 $22 = (__Znwj($21)|0);
 $23 = ($4|0)==(0);
 if (!($23)) {
  _memcpy(($22|0),($24|0),($4|0))|0;
 }
 $25 = ($6|0)==(0);
 if (!($25)) {
  $26 = (($22) + ($4)|0);
  _memcpy(($26|0),($7|0),($6|0))|0;
 }
 $27 = (($3) - ($5))|0;
 $28 = (($27) - ($4))|0;
 $29 = ($28|0)==(0);
 if (!($29)) {
  $30 = (($22) + ($4)|0);
  $31 = (($30) + ($6)|0);
  $32 = (($24) + ($4)|0);
  $33 = (($32) + ($5)|0);
  _memcpy(($31|0),($33|0),($28|0))|0;
 }
 $34 = ($1|0)==(10);
 if (!($34)) {
  __ZdlPv($24);
 }
 HEAP32[$0>>2] = $22;
 $35 = $21 | -2147483648;
 $36 = ((($0)) + 8|0);
 HEAP32[$36>>2] = $35;
 $37 = (($27) + ($6))|0;
 $38 = ((($0)) + 4|0);
 HEAP32[$38>>2] = $37;
 $39 = (($22) + ($37)|0);
 HEAP8[$39>>0] = 0;
 return;
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE7reserveEj($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$016 = 0, $$01738 = 0, $$01739 = 0, $$01745 = 0, $$018$off036 = 0, $$018$off037 = 0, $$018$off044 = 0, $$019$off034 = 0, $$019$off043 = 0, $$140 = 0, $$141 = 0, $$146 = 0, $$phitmp$i = 0, $$sroa$speculated = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0;
 var $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0;
 var $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $phitmp$i = 0, $phitmp$i21 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1>>>0)>(4294967279);
 if ($2) {
  __ZNKSt3__221__basic_string_commonILb1EE20__throw_length_errorEv($0);
  // unreachable;
 }
 $3 = ((($0)) + 11|0);
 $4 = HEAP8[$3>>0]|0;
 $5 = ($4<<24>>24)<(0);
 if ($5) {
  $6 = ((($0)) + 8|0);
  $7 = HEAP32[$6>>2]|0;
  $8 = $7 & 2147483647;
  $phitmp$i = (($8) + -1)|0;
  $9 = ((($0)) + 4|0);
  $10 = HEAP32[$9>>2]|0;
  $12 = $10;$18 = $phitmp$i;
 } else {
  $11 = $4&255;
  $12 = $11;$18 = 10;
 }
 $13 = ($12>>>0)>($1>>>0);
 $$sroa$speculated = $13 ? $12 : $1;
 $14 = ($$sroa$speculated>>>0)<(11);
 $15 = (($$sroa$speculated) + 16)|0;
 $16 = $15 & -16;
 $phitmp$i21 = (($16) + -1)|0;
 $$phitmp$i = $14 ? 10 : $phitmp$i21;
 $17 = ($$phitmp$i|0)==($18|0);
 L8: do {
  if (!($17)) {
   do {
    if ($14) {
     $28 = HEAP32[$0>>2]|0;
     if ($5) {
      $$01739 = $28;$$018$off037 = 0;$$141 = $0;
      label = 16;
     } else {
      $$01745 = $28;$$018$off044 = 0;$$019$off043 = 1;$$146 = $0;
      label = 17;
     }
    } else {
     $19 = ($$phitmp$i>>>0)>($18>>>0);
     $20 = (($$phitmp$i) + 1)|0;
     if ($19) {
      $21 = (__Znwj($20)|0);
      $$016 = $21;
     } else {
      __THREW__ = 0;
      $22 = (invoke_ii(116,($20|0))|0);
      $23 = __THREW__; __THREW__ = 0;
      $24 = $23&1;
      if ($24) {
       $25 = ___cxa_find_matching_catch_3(0|0)|0;
       $26 = tempRet0;
       (___cxa_begin_catch(($25|0))|0);
       ___cxa_end_catch();
       break L8;
      } else {
       $$016 = $22;
      }
     }
     if ($5) {
      $27 = HEAP32[$0>>2]|0;
      $$01739 = $27;$$018$off037 = 1;$$141 = $$016;
      label = 16;
      break;
     } else {
      $$01745 = $0;$$018$off044 = 1;$$019$off043 = 0;$$146 = $$016;
      label = 17;
      break;
     }
    }
   } while(0);
   if ((label|0) == 16) {
    $29 = ((($0)) + 4|0);
    $30 = HEAP32[$29>>2]|0;
    $$01738 = $$01739;$$018$off036 = $$018$off037;$$019$off034 = 1;$$140 = $$141;$33 = $30;
   }
   else if ((label|0) == 17) {
    $31 = $4&255;
    $$01738 = $$01745;$$018$off036 = $$018$off044;$$019$off034 = $$019$off043;$$140 = $$146;$33 = $31;
   }
   $32 = (($33) + 1)|0;
   $34 = ($32|0)==(0);
   if (!($34)) {
    _memcpy(($$140|0),($$01738|0),($32|0))|0;
   }
   if ($$019$off034) {
    __ZdlPv($$01738);
   }
   if ($$018$off036) {
    $35 = (($$phitmp$i) + 1)|0;
    $36 = $35 | -2147483648;
    $37 = ((($0)) + 8|0);
    HEAP32[$37>>2] = $36;
    $38 = ((($0)) + 4|0);
    HEAP32[$38>>2] = $12;
    HEAP32[$0>>2] = $$140;
    break;
   } else {
    $39 = $12&255;
    HEAP8[$3>>0] = $39;
    break;
   }
  }
 } while(0);
 return;
}
function __ZNKSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE7compareEjjPKcj($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$ = 0, $$$ = 0, $$sroa$speculated = 0, $$sroa$speculated19 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($0)) + 11|0);
 $6 = HEAP8[$5>>0]|0;
 $7 = ($6<<24>>24)<(0);
 if ($7) {
  $8 = ((($0)) + 4|0);
  $9 = HEAP32[$8>>2]|0;
  $11 = $9;
 } else {
  $10 = $6&255;
  $11 = $10;
 }
 $12 = ($11>>>0)<($1>>>0);
 $13 = ($4|0)==(-1);
 $or$cond = $13 | $12;
 if ($or$cond) {
  __ZNKSt3__221__basic_string_commonILb1EE20__throw_out_of_rangeEv($0);
  // unreachable;
 }
 $14 = (($11) - ($1))|0;
 $15 = ($14>>>0)<($2>>>0);
 $$sroa$speculated = $15 ? $14 : $2;
 if ($7) {
  $16 = HEAP32[$0>>2]|0;
  $18 = $16;
 } else {
  $18 = $0;
 }
 $17 = (($18) + ($1)|0);
 $19 = ($$sroa$speculated>>>0)>($4>>>0);
 $$sroa$speculated19 = $19 ? $4 : $$sroa$speculated;
 $20 = (__ZNSt3__211char_traitsIcE7compareEPKcS3_j($17,$3,$$sroa$speculated19)|0);
 $21 = ($20|0)==(0);
 if ($21) {
  $22 = ($$sroa$speculated>>>0)<($4>>>0);
  $$ = $19&1;
  $$$ = $22 ? -1 : $$;
  return ($$$|0);
 } else {
  return ($20|0);
 }
 return (0)|0;
}
function __ZL25default_terminate_handlerv() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0;
 var $vararg_buffer3 = 0, $vararg_buffer7 = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $vararg_buffer10 = sp + 32|0;
 $vararg_buffer7 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $0 = sp + 36|0;
 $1 = (___cxa_get_globals_fast()|0);
 $2 = ($1|0)==(0|0);
 if (!($2)) {
  $3 = HEAP32[$1>>2]|0;
  $4 = ($3|0)==(0|0);
  if (!($4)) {
   $5 = ((($3)) + 80|0);
   $6 = ((($3)) + 48|0);
   $7 = $6;
   $8 = $7;
   $9 = HEAP32[$8>>2]|0;
   $10 = (($7) + 4)|0;
   $11 = $10;
   $12 = HEAP32[$11>>2]|0;
   $13 = $9 & -256;
   $14 = ($13|0)==(1126902528);
   $15 = ($12|0)==(1129074247);
   $16 = $14 & $15;
   if (!($16)) {
    $37 = HEAP32[346]|0;
    HEAP32[$vararg_buffer7>>2] = $37;
    _abort_message(5984,$vararg_buffer7);
    // unreachable;
   }
   $17 = ($9|0)==(1126902529);
   $18 = ($12|0)==(1129074247);
   $19 = $17 & $18;
   if ($19) {
    $20 = ((($3)) + 44|0);
    $21 = HEAP32[$20>>2]|0;
    $22 = $21;
   } else {
    $22 = $5;
   }
   HEAP32[$0>>2] = $22;
   $23 = HEAP32[$3>>2]|0;
   $24 = ((($23)) + 4|0);
   $25 = HEAP32[$24>>2]|0;
   $26 = HEAP32[74]|0;
   $27 = ((($26)) + 16|0);
   $28 = HEAP32[$27>>2]|0;
   $29 = (FUNCTION_TABLE_iiii[$28 & 127](296,$23,$0)|0);
   if ($29) {
    $30 = HEAP32[$0>>2]|0;
    $31 = HEAP32[346]|0;
    $32 = HEAP32[$30>>2]|0;
    $33 = ((($32)) + 8|0);
    $34 = HEAP32[$33>>2]|0;
    $35 = (FUNCTION_TABLE_ii[$34 & 127]($30)|0);
    HEAP32[$vararg_buffer>>2] = $31;
    $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
    HEAP32[$vararg_ptr1>>2] = $25;
    $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
    HEAP32[$vararg_ptr2>>2] = $35;
    _abort_message(5898,$vararg_buffer);
    // unreachable;
   } else {
    $36 = HEAP32[346]|0;
    HEAP32[$vararg_buffer3>>2] = $36;
    $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
    HEAP32[$vararg_ptr6>>2] = $25;
    _abort_message(5943,$vararg_buffer3);
    // unreachable;
   }
  }
 }
 _abort_message(6022,$vararg_buffer10);
 // unreachable;
}
function ___cxa_get_globals_fast() {
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $0 = (_pthread_once((7352|0),(117|0))|0);
 $1 = ($0|0)==(0);
 if ($1) {
  $2 = HEAP32[1839]|0;
  $3 = (_pthread_getspecific(($2|0))|0);
  STACKTOP = sp;return ($3|0);
 } else {
  _abort_message(6173,$vararg_buffer);
  // unreachable;
 }
 return (0)|0;
}
function _abort_message($0,$varargs) {
 $0 = $0|0;
 $varargs = $varargs|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp;
 HEAP32[$1>>2] = $varargs;
 $2 = HEAP32[313]|0;
 (_vfprintf($2,$0,$1)|0);
 (_fputc(10,$2)|0);
 _abort();
 // unreachable;
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZdlPv($0);
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop1Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $$2 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $3 = sp;
 $4 = ($0|0)==($1|0);
 if ($4) {
  $$2 = 1;
 } else {
  $5 = ($1|0)==(0|0);
  if ($5) {
   $$2 = 0;
  } else {
   $6 = (___dynamic_cast($1,320,304,0)|0);
   $7 = ($6|0)==(0|0);
   if ($7) {
    $$2 = 0;
   } else {
    $8 = ((($3)) + 4|0);
    dest=$8; stop=dest+52|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
    HEAP32[$3>>2] = $6;
    $9 = ((($3)) + 8|0);
    HEAP32[$9>>2] = $0;
    $10 = ((($3)) + 12|0);
    HEAP32[$10>>2] = -1;
    $11 = ((($3)) + 48|0);
    HEAP32[$11>>2] = 1;
    $12 = HEAP32[$6>>2]|0;
    $13 = ((($12)) + 28|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = HEAP32[$2>>2]|0;
    FUNCTION_TABLE_viiii[$14 & 127]($6,$3,$15,1);
    $16 = ((($3)) + 24|0);
    $17 = HEAP32[$16>>2]|0;
    $18 = ($17|0)==(1);
    if ($18) {
     $19 = ((($3)) + 16|0);
     $20 = HEAP32[$19>>2]|0;
     HEAP32[$2>>2] = $20;
     $$0 = 1;
    } else {
     $$0 = 0;
    }
    $$2 = $$0;
   }
  }
 }
 STACKTOP = sp;return ($$2|0);
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $6 = ((($1)) + 8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = ($0|0)==($7|0);
 if ($8) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0,$1,$2,$3,$4);
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($1)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ($0|0)==($6|0);
 do {
  if ($7) {
   $8 = ((($1)) + 4|0);
   $9 = HEAP32[$8>>2]|0;
   $10 = ($9|0)==($2|0);
   if ($10) {
    $11 = ((($1)) + 28|0);
    $12 = HEAP32[$11>>2]|0;
    $13 = ($12|0)==(1);
    if (!($13)) {
     HEAP32[$11>>2] = $3;
    }
   }
  } else {
   $14 = HEAP32[$1>>2]|0;
   $15 = ($0|0)==($14|0);
   if ($15) {
    $16 = ((($1)) + 16|0);
    $17 = HEAP32[$16>>2]|0;
    $18 = ($17|0)==($2|0);
    if (!($18)) {
     $19 = ((($1)) + 20|0);
     $20 = HEAP32[$19>>2]|0;
     $21 = ($20|0)==($2|0);
     if (!($21)) {
      $24 = ((($1)) + 32|0);
      HEAP32[$24>>2] = $3;
      HEAP32[$19>>2] = $2;
      $25 = ((($1)) + 40|0);
      $26 = HEAP32[$25>>2]|0;
      $27 = (($26) + 1)|0;
      HEAP32[$25>>2] = $27;
      $28 = ((($1)) + 36|0);
      $29 = HEAP32[$28>>2]|0;
      $30 = ($29|0)==(1);
      if ($30) {
       $31 = ((($1)) + 24|0);
       $32 = HEAP32[$31>>2]|0;
       $33 = ($32|0)==(2);
       if ($33) {
        $34 = ((($1)) + 54|0);
        HEAP8[$34>>0] = 1;
       }
      }
      $35 = ((($1)) + 44|0);
      HEAP32[$35>>2] = 4;
      break;
     }
    }
    $22 = ($3|0)==(1);
    if ($22) {
     $23 = ((($1)) + 32|0);
     HEAP32[$23>>2] = 1;
    }
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 8|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($0|0)==($5|0);
 if ($6) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0,$1,$2,$3);
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 16|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($5|0)==(0|0);
 do {
  if ($6) {
   HEAP32[$4>>2] = $2;
   $7 = ((($1)) + 24|0);
   HEAP32[$7>>2] = $3;
   $8 = ((($1)) + 36|0);
   HEAP32[$8>>2] = 1;
  } else {
   $9 = ($5|0)==($2|0);
   if (!($9)) {
    $13 = ((($1)) + 36|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = (($14) + 1)|0;
    HEAP32[$13>>2] = $15;
    $16 = ((($1)) + 24|0);
    HEAP32[$16>>2] = 2;
    $17 = ((($1)) + 54|0);
    HEAP8[$17>>0] = 1;
    break;
   }
   $10 = ((($1)) + 24|0);
   $11 = HEAP32[$10>>2]|0;
   $12 = ($11|0)==(2);
   if ($12) {
    HEAP32[$10>>2] = $3;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond22 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($1)) + 53|0);
 HEAP8[$5>>0] = 1;
 $6 = ((($1)) + 4|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = ($7|0)==($3|0);
 do {
  if ($8) {
   $9 = ((($1)) + 52|0);
   HEAP8[$9>>0] = 1;
   $10 = ((($1)) + 16|0);
   $11 = HEAP32[$10>>2]|0;
   $12 = ($11|0)==(0|0);
   if ($12) {
    HEAP32[$10>>2] = $2;
    $13 = ((($1)) + 24|0);
    HEAP32[$13>>2] = $4;
    $14 = ((($1)) + 36|0);
    HEAP32[$14>>2] = 1;
    $15 = ((($1)) + 48|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = ($16|0)==(1);
    $18 = ($4|0)==(1);
    $or$cond = $17 & $18;
    if (!($or$cond)) {
     break;
    }
    $19 = ((($1)) + 54|0);
    HEAP8[$19>>0] = 1;
    break;
   }
   $20 = ($11|0)==($2|0);
   if (!($20)) {
    $30 = ((($1)) + 36|0);
    $31 = HEAP32[$30>>2]|0;
    $32 = (($31) + 1)|0;
    HEAP32[$30>>2] = $32;
    $33 = ((($1)) + 54|0);
    HEAP8[$33>>0] = 1;
    break;
   }
   $21 = ((($1)) + 24|0);
   $22 = HEAP32[$21>>2]|0;
   $23 = ($22|0)==(2);
   if ($23) {
    HEAP32[$21>>2] = $4;
    $27 = $4;
   } else {
    $27 = $22;
   }
   $24 = ((($1)) + 48|0);
   $25 = HEAP32[$24>>2]|0;
   $26 = ($25|0)==(1);
   $28 = ($27|0)==(1);
   $or$cond22 = $26 & $28;
   if ($or$cond22) {
    $29 = ((($1)) + 54|0);
    HEAP8[$29>>0] = 1;
   }
  }
 } while(0);
 return;
}
function ___dynamic_cast($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$ = 0, $$0 = 0, $$33 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond28 = 0, $or$cond30 = 0, $or$cond32 = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $4 = sp;
 $5 = HEAP32[$0>>2]|0;
 $6 = ((($5)) + -8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (($0) + ($7)|0);
 $9 = ((($5)) + -4|0);
 $10 = HEAP32[$9>>2]|0;
 HEAP32[$4>>2] = $2;
 $11 = ((($4)) + 4|0);
 HEAP32[$11>>2] = $0;
 $12 = ((($4)) + 8|0);
 HEAP32[$12>>2] = $1;
 $13 = ((($4)) + 12|0);
 HEAP32[$13>>2] = $3;
 $14 = ((($4)) + 16|0);
 $15 = ((($4)) + 20|0);
 $16 = ((($4)) + 24|0);
 $17 = ((($4)) + 28|0);
 $18 = ((($4)) + 32|0);
 $19 = ((($4)) + 40|0);
 $20 = ($10|0)==($2|0);
 dest=$14; stop=dest+36|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));HEAP16[$14+36>>1]=0|0;HEAP8[$14+38>>0]=0|0;
 L1: do {
  if ($20) {
   $21 = ((($4)) + 48|0);
   HEAP32[$21>>2] = 1;
   $22 = HEAP32[$2>>2]|0;
   $23 = ((($22)) + 20|0);
   $24 = HEAP32[$23>>2]|0;
   FUNCTION_TABLE_viiiiii[$24 & 127]($2,$4,$8,$8,1,0);
   $25 = HEAP32[$16>>2]|0;
   $26 = ($25|0)==(1);
   $$ = $26 ? $8 : 0;
   $$0 = $$;
  } else {
   $27 = ((($4)) + 36|0);
   $28 = HEAP32[$10>>2]|0;
   $29 = ((($28)) + 24|0);
   $30 = HEAP32[$29>>2]|0;
   FUNCTION_TABLE_viiiii[$30 & 63]($10,$4,$8,1,0);
   $31 = HEAP32[$27>>2]|0;
   switch ($31|0) {
   case 0:  {
    $32 = HEAP32[$19>>2]|0;
    $33 = ($32|0)==(1);
    $34 = HEAP32[$17>>2]|0;
    $35 = ($34|0)==(1);
    $or$cond = $33 & $35;
    $36 = HEAP32[$18>>2]|0;
    $37 = ($36|0)==(1);
    $or$cond28 = $or$cond & $37;
    $38 = HEAP32[$15>>2]|0;
    $$33 = $or$cond28 ? $38 : 0;
    $$0 = $$33;
    break L1;
    break;
   }
   case 1:  {
    break;
   }
   default: {
    $$0 = 0;
    break L1;
   }
   }
   $39 = HEAP32[$16>>2]|0;
   $40 = ($39|0)==(1);
   if (!($40)) {
    $41 = HEAP32[$19>>2]|0;
    $42 = ($41|0)==(0);
    $43 = HEAP32[$17>>2]|0;
    $44 = ($43|0)==(1);
    $or$cond30 = $42 & $44;
    $45 = HEAP32[$18>>2]|0;
    $46 = ($45|0)==(1);
    $or$cond32 = $or$cond30 & $46;
    if (!($or$cond32)) {
     $$0 = 0;
     break;
    }
   }
   $47 = HEAP32[$14>>2]|0;
   $$0 = $47;
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZdlPv($0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $6 = ((($1)) + 8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = ($0|0)==($7|0);
 if ($8) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0,$1,$2,$3,$4);
 } else {
  $9 = ((($0)) + 8|0);
  $10 = HEAP32[$9>>2]|0;
  $11 = HEAP32[$10>>2]|0;
  $12 = ((($11)) + 20|0);
  $13 = HEAP32[$12>>2]|0;
  FUNCTION_TABLE_viiiiii[$13 & 127]($10,$1,$2,$3,$4,$5);
 }
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$037$off039 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $not$ = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($1)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ($0|0)==($6|0);
 do {
  if ($7) {
   $8 = ((($1)) + 4|0);
   $9 = HEAP32[$8>>2]|0;
   $10 = ($9|0)==($2|0);
   if ($10) {
    $11 = ((($1)) + 28|0);
    $12 = HEAP32[$11>>2]|0;
    $13 = ($12|0)==(1);
    if (!($13)) {
     HEAP32[$11>>2] = $3;
    }
   }
  } else {
   $14 = HEAP32[$1>>2]|0;
   $15 = ($0|0)==($14|0);
   if (!($15)) {
    $49 = ((($0)) + 8|0);
    $50 = HEAP32[$49>>2]|0;
    $51 = HEAP32[$50>>2]|0;
    $52 = ((($51)) + 24|0);
    $53 = HEAP32[$52>>2]|0;
    FUNCTION_TABLE_viiiii[$53 & 63]($50,$1,$2,$3,$4);
    break;
   }
   $16 = ((($1)) + 16|0);
   $17 = HEAP32[$16>>2]|0;
   $18 = ($17|0)==($2|0);
   if (!($18)) {
    $19 = ((($1)) + 20|0);
    $20 = HEAP32[$19>>2]|0;
    $21 = ($20|0)==($2|0);
    if (!($21)) {
     $24 = ((($1)) + 32|0);
     HEAP32[$24>>2] = $3;
     $25 = ((($1)) + 44|0);
     $26 = HEAP32[$25>>2]|0;
     $27 = ($26|0)==(4);
     if ($27) {
      break;
     }
     $28 = ((($1)) + 52|0);
     HEAP8[$28>>0] = 0;
     $29 = ((($1)) + 53|0);
     HEAP8[$29>>0] = 0;
     $30 = ((($0)) + 8|0);
     $31 = HEAP32[$30>>2]|0;
     $32 = HEAP32[$31>>2]|0;
     $33 = ((($32)) + 20|0);
     $34 = HEAP32[$33>>2]|0;
     FUNCTION_TABLE_viiiiii[$34 & 127]($31,$1,$2,$2,1,$4);
     $35 = HEAP8[$29>>0]|0;
     $36 = ($35<<24>>24)==(0);
     if ($36) {
      $$037$off039 = 0;
      label = 13;
     } else {
      $37 = HEAP8[$28>>0]|0;
      $not$ = ($37<<24>>24)==(0);
      if ($not$) {
       $$037$off039 = 1;
       label = 13;
      } else {
       label = 17;
      }
     }
     do {
      if ((label|0) == 13) {
       HEAP32[$19>>2] = $2;
       $38 = ((($1)) + 40|0);
       $39 = HEAP32[$38>>2]|0;
       $40 = (($39) + 1)|0;
       HEAP32[$38>>2] = $40;
       $41 = ((($1)) + 36|0);
       $42 = HEAP32[$41>>2]|0;
       $43 = ($42|0)==(1);
       if ($43) {
        $44 = ((($1)) + 24|0);
        $45 = HEAP32[$44>>2]|0;
        $46 = ($45|0)==(2);
        if ($46) {
         $47 = ((($1)) + 54|0);
         HEAP8[$47>>0] = 1;
         if ($$037$off039) {
          label = 17;
          break;
         } else {
          $48 = 4;
          break;
         }
        }
       }
       if ($$037$off039) {
        label = 17;
       } else {
        $48 = 4;
       }
      }
     } while(0);
     if ((label|0) == 17) {
      $48 = 3;
     }
     HEAP32[$25>>2] = $48;
     break;
    }
   }
   $22 = ($3|0)==(1);
   if ($22) {
    $23 = ((($1)) + 32|0);
    HEAP32[$23>>2] = 1;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 8|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($0|0)==($5|0);
 if ($6) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0,$1,$2,$3);
 } else {
  $7 = ((($0)) + 8|0);
  $8 = HEAP32[$7>>2]|0;
  $9 = HEAP32[$8>>2]|0;
  $10 = ((($9)) + 28|0);
  $11 = HEAP32[$10>>2]|0;
  FUNCTION_TABLE_viiii[$11 & 127]($8,$1,$2,$3);
 }
 return;
}
function __ZNSt9type_infoD2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var $0 = 0, $1 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $0 = (_pthread_key_create((7356|0),(118|0))|0);
 $1 = ($0|0)==(0);
 if ($1) {
  STACKTOP = sp;return;
 } else {
  _abort_message(6222,$vararg_buffer);
  // unreachable;
 }
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 _free($0);
 $1 = HEAP32[1839]|0;
 $2 = (_pthread_setspecific(($1|0),(0|0))|0);
 $3 = ($2|0)==(0);
 if ($3) {
  STACKTOP = sp;return;
 } else {
  _abort_message(6272,$vararg_buffer);
  // unreachable;
 }
}
function __ZSt9terminatev() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 __THREW__ = 0;
 $0 = (invoke_i(119)|0);
 $1 = __THREW__; __THREW__ = 0;
 $2 = $1&1;
 if ($2) {
  $20 = ___cxa_find_matching_catch_3(0|0)|0;
  $21 = tempRet0;
  ___clang_call_terminate($20);
  // unreachable;
 }
 $3 = ($0|0)==(0|0);
 if (!($3)) {
  $4 = HEAP32[$0>>2]|0;
  $5 = ($4|0)==(0|0);
  if (!($5)) {
   $6 = ((($4)) + 48|0);
   $7 = $6;
   $8 = $7;
   $9 = HEAP32[$8>>2]|0;
   $10 = (($7) + 4)|0;
   $11 = $10;
   $12 = HEAP32[$11>>2]|0;
   $13 = $9 & -256;
   $14 = ($13|0)==(1126902528);
   $15 = ($12|0)==(1129074247);
   $16 = $14 & $15;
   if ($16) {
    $17 = ((($4)) + 12|0);
    $18 = HEAP32[$17>>2]|0;
    __ZSt11__terminatePFvvE($18);
    // unreachable;
   }
  }
 }
 $19 = (__ZSt13get_terminatev()|0);
 __ZSt11__terminatePFvvE($19);
 // unreachable;
}
function __ZSt11__terminatePFvvE($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 __THREW__ = 0;
 invoke_v($0|0);
 $1 = __THREW__; __THREW__ = 0;
 $2 = $1&1;
 if (!($2)) {
  __THREW__ = 0;
  invoke_vii(120,(6325|0),($vararg_buffer|0));
  $3 = __THREW__; __THREW__ = 0;
 }
 $4 = ___cxa_find_matching_catch_3(0|0)|0;
 $5 = tempRet0;
 (___cxa_begin_catch(($4|0))|0);
 __THREW__ = 0;
 invoke_vii(120,(6365|0),($vararg_buffer1|0));
 $6 = __THREW__; __THREW__ = 0;
 $7 = ___cxa_find_matching_catch_3(0|0)|0;
 $8 = tempRet0;
 __THREW__ = 0;
 invoke_v(121);
 $9 = __THREW__; __THREW__ = 0;
 $10 = $9&1;
 if ($10) {
  $11 = ___cxa_find_matching_catch_3(0|0)|0;
  $12 = tempRet0;
  ___clang_call_terminate($11);
  // unreachable;
 } else {
  ___clang_call_terminate($7);
  // unreachable;
 }
}
function __ZSt13get_terminatev() {
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[345]|0;HEAP32[345] = (($0+0)|0);
 $1 = $0;
 return ($1|0);
}
function __ZNSt9bad_allocD2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNSt9bad_allocD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZdlPv($0);
 return;
}
function __ZNKSt9bad_alloc4whatEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (6415|0);
}
function __ZNSt9exceptionD2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNSt11logic_errorD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = (1496);
 $1 = ((($0)) + 4|0);
 __ZN12_GLOBAL__N_114__libcpp_nmstrD2Ev($1);
 return;
}
function __ZNSt11logic_errorD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZNSt11logic_errorD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZNKSt11logic_error4whatEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 return ($2|0);
}
function __ZN12_GLOBAL__N_114__libcpp_nmstrD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ((($1)) + -4|0);
 $3 = HEAP32[$2>>2]|0;HEAP32[$2>>2] = (($3+-1)|0);
 $4 = (($3) + -1)|0;
 $5 = ($4|0)<(0);
 if ($5) {
  $6 = HEAP32[$0>>2]|0;
  $7 = ((($6)) + -12|0);
  __ZdlPv($7);
 }
 return;
}
function __ZNSt12length_errorD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZNSt11logic_errorD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZNSt12out_of_rangeD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZNSt11logic_errorD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZN10__cxxabiv123__fundamental_type_infoD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZdlPv($0);
 return;
}
function __ZNK10__cxxabiv123__fundamental_type_info9can_catchEPKNS_16__shim_type_infoERPv($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($0|0)==($1|0);
 return ($3|0);
}
function __ZN10__cxxabiv119__pointer_type_infoD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZdlPv($0);
 return;
}
function __ZNK10__cxxabiv119__pointer_type_info9can_catchEPKNS_16__shim_type_infoERPv($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$$i = 0, $$0 = 0, $$4 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $3 = sp;
 $4 = HEAP32[$2>>2]|0;
 $5 = HEAP32[$4>>2]|0;
 HEAP32[$2>>2] = $5;
 $6 = ($0|0)==($1|0);
 $7 = ($1|0)==(480|0);
 $$$i = $6 | $7;
 if ($$$i) {
  $$4 = 1;
 } else {
  $8 = ($1|0)==(0|0);
  if ($8) {
   $$4 = 0;
  } else {
   $9 = (___dynamic_cast($1,320,440,0)|0);
   $10 = ($9|0)==(0|0);
   if ($10) {
    $$4 = 0;
   } else {
    $11 = ((($9)) + 8|0);
    $12 = HEAP32[$11>>2]|0;
    $13 = ((($0)) + 8|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = $14 ^ -1;
    $16 = $12 & $15;
    $17 = ($16|0)==(0);
    if ($17) {
     $18 = ((($0)) + 12|0);
     $19 = HEAP32[$18>>2]|0;
     $20 = ((($9)) + 12|0);
     $21 = HEAP32[$20>>2]|0;
     $22 = ($19|0)==($21|0);
     $23 = ($19|0)==(472|0);
     $or$cond = $23 | $22;
     if ($or$cond) {
      $$4 = 1;
     } else {
      $24 = ($19|0)==(0|0);
      if ($24) {
       $$4 = 0;
      } else {
       $25 = (___dynamic_cast($19,320,304,0)|0);
       $26 = ($25|0)==(0|0);
       if ($26) {
        $$4 = 0;
       } else {
        $27 = HEAP32[$20>>2]|0;
        $28 = ($27|0)==(0|0);
        if ($28) {
         $$4 = 0;
        } else {
         $29 = (___dynamic_cast($27,320,304,0)|0);
         $30 = ($29|0)==(0|0);
         if ($30) {
          $$4 = 0;
         } else {
          $31 = ((($3)) + 4|0);
          dest=$31; stop=dest+52|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
          HEAP32[$3>>2] = $29;
          $32 = ((($3)) + 8|0);
          HEAP32[$32>>2] = $25;
          $33 = ((($3)) + 12|0);
          HEAP32[$33>>2] = -1;
          $34 = ((($3)) + 48|0);
          HEAP32[$34>>2] = 1;
          $35 = HEAP32[$29>>2]|0;
          $36 = ((($35)) + 28|0);
          $37 = HEAP32[$36>>2]|0;
          $38 = HEAP32[$2>>2]|0;
          FUNCTION_TABLE_viiii[$37 & 127]($29,$3,$38,1);
          $39 = ((($3)) + 24|0);
          $40 = HEAP32[$39>>2]|0;
          $41 = ($40|0)==(1);
          if ($41) {
           $42 = ((($3)) + 16|0);
           $43 = HEAP32[$42>>2]|0;
           HEAP32[$2>>2] = $43;
           $$0 = 1;
          } else {
           $$0 = 0;
          }
          $$4 = $$0;
         }
        }
       }
      }
     }
    } else {
     $$4 = 0;
    }
   }
  }
 }
 STACKTOP = sp;return ($$4|0);
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZdlPv($0);
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $6 = ((($1)) + 8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = ($0|0)==($7|0);
 if ($8) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0,$1,$2,$3,$4);
 } else {
  $9 = ((($1)) + 52|0);
  $10 = HEAP16[$9>>1]|0;
  $11 = $10&255;
  $12 = ((($1)) + 53|0);
  $13 = ($10&65535) >>> 8;
  $14 = $13&255;
  $15 = ((($0)) + 16|0);
  $16 = ((($0)) + 12|0);
  $17 = HEAP32[$16>>2]|0;
  $18 = (((($0)) + 16|0) + ($17<<3)|0);
  HEAP8[$9>>0] = 0;
  HEAP8[$12>>0] = 0;
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($15,$1,$2,$3,$4,$5);
  $19 = ($17|0)>(1);
  L4: do {
   if ($19) {
    $20 = ((($0)) + 24|0);
    $21 = ((($1)) + 24|0);
    $22 = ((($0)) + 8|0);
    $23 = ((($1)) + 54|0);
    $$0 = $20;
    while(1) {
     $24 = HEAP8[$23>>0]|0;
     $25 = ($24<<24>>24)==(0);
     if (!($25)) {
      break L4;
     }
     $26 = HEAP16[$9>>1]|0;
     $27 = $26&255;
     $28 = ($27<<24>>24)==(0);
     if ($28) {
      $34 = ($26&65535)<(256);
      if (!($34)) {
       $35 = HEAP32[$22>>2]|0;
       $36 = $35 & 1;
       $37 = ($36|0)==(0);
       if ($37) {
        break L4;
       }
      }
     } else {
      $29 = HEAP32[$21>>2]|0;
      $30 = ($29|0)==(1);
      if ($30) {
       break L4;
      }
      $31 = HEAP32[$22>>2]|0;
      $32 = $31 & 2;
      $33 = ($32|0)==(0);
      if ($33) {
       break L4;
      }
     }
     HEAP8[$9>>0] = 0;
     HEAP8[$12>>0] = 0;
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0,$1,$2,$3,$4,$5);
     $38 = ((($$0)) + 8|0);
     $39 = ($38>>>0)<($18>>>0);
     if ($39) {
      $$0 = $38;
     } else {
      break;
     }
    }
   }
  } while(0);
  HEAP8[$9>>0] = $11;
  HEAP8[$12>>0] = $14;
 }
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0;
 var $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0;
 var $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0;
 var $96 = 0, $97 = 0, $98 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($1)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ($0|0)==($6|0);
 L1: do {
  if ($7) {
   $8 = ((($1)) + 4|0);
   $9 = HEAP32[$8>>2]|0;
   $10 = ($9|0)==($2|0);
   if ($10) {
    $11 = ((($1)) + 28|0);
    $12 = HEAP32[$11>>2]|0;
    $13 = ($12|0)==(1);
    if (!($13)) {
     HEAP32[$11>>2] = $3;
    }
   }
  } else {
   $14 = HEAP32[$1>>2]|0;
   $15 = ($0|0)==($14|0);
   if (!($15)) {
    $62 = ((($0)) + 16|0);
    $63 = ((($0)) + 12|0);
    $64 = HEAP32[$63>>2]|0;
    $65 = (((($0)) + 16|0) + ($64<<3)|0);
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($62,$1,$2,$3,$4);
    $66 = ((($0)) + 24|0);
    $67 = ($64|0)>(1);
    if (!($67)) {
     break;
    }
    $68 = ((($0)) + 8|0);
    $69 = HEAP32[$68>>2]|0;
    $70 = $69 & 2;
    $71 = ($70|0)==(0);
    if ($71) {
     $72 = ((($1)) + 36|0);
     $73 = HEAP32[$72>>2]|0;
     $74 = ($73|0)==(1);
     if (!($74)) {
      $80 = $69 & 1;
      $81 = ($80|0)==(0);
      if ($81) {
       $84 = ((($1)) + 54|0);
       $$2 = $66;
       while(1) {
        $93 = HEAP8[$84>>0]|0;
        $94 = ($93<<24>>24)==(0);
        if (!($94)) {
         break L1;
        }
        $95 = HEAP32[$72>>2]|0;
        $96 = ($95|0)==(1);
        if ($96) {
         break L1;
        }
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2,$1,$2,$3,$4);
        $97 = ((($$2)) + 8|0);
        $98 = ($97>>>0)<($65>>>0);
        if ($98) {
         $$2 = $97;
        } else {
         break L1;
        }
       }
      }
      $82 = ((($1)) + 24|0);
      $83 = ((($1)) + 54|0);
      $$1 = $66;
      while(1) {
       $85 = HEAP8[$83>>0]|0;
       $86 = ($85<<24>>24)==(0);
       if (!($86)) {
        break L1;
       }
       $87 = HEAP32[$72>>2]|0;
       $88 = ($87|0)==(1);
       if ($88) {
        $89 = HEAP32[$82>>2]|0;
        $90 = ($89|0)==(1);
        if ($90) {
         break L1;
        }
       }
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1,$1,$2,$3,$4);
       $91 = ((($$1)) + 8|0);
       $92 = ($91>>>0)<($65>>>0);
       if ($92) {
        $$1 = $91;
       } else {
        break L1;
       }
      }
     }
    }
    $75 = ((($1)) + 54|0);
    $$0 = $66;
    while(1) {
     $76 = HEAP8[$75>>0]|0;
     $77 = ($76<<24>>24)==(0);
     if (!($77)) {
      break L1;
     }
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0,$1,$2,$3,$4);
     $78 = ((($$0)) + 8|0);
     $79 = ($78>>>0)<($65>>>0);
     if ($79) {
      $$0 = $78;
     } else {
      break L1;
     }
    }
   }
   $16 = ((($1)) + 16|0);
   $17 = HEAP32[$16>>2]|0;
   $18 = ($17|0)==($2|0);
   if (!($18)) {
    $19 = ((($1)) + 20|0);
    $20 = HEAP32[$19>>2]|0;
    $21 = ($20|0)==($2|0);
    if (!($21)) {
     $24 = ((($1)) + 32|0);
     HEAP32[$24>>2] = $3;
     $25 = ((($1)) + 44|0);
     $26 = HEAP32[$25>>2]|0;
     $27 = ($26|0)==(4);
     if ($27) {
      break;
     }
     $28 = ((($0)) + 16|0);
     $29 = ((($0)) + 12|0);
     $30 = HEAP32[$29>>2]|0;
     $31 = (((($0)) + 16|0) + ($30<<3)|0);
     $32 = ((($1)) + 52|0);
     $33 = ((($1)) + 53|0);
     $34 = ((($1)) + 54|0);
     $35 = ((($0)) + 8|0);
     $36 = ((($1)) + 24|0);
     $$081$off0 = 0;$$084 = $28;$$085$off0 = 0;
     L34: while(1) {
      $37 = ($$084>>>0)<($31>>>0);
      if (!($37)) {
       $$283$off0 = $$081$off0;
       label = 20;
       break;
      }
      HEAP8[$32>>0] = 0;
      HEAP8[$33>>0] = 0;
      __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084,$1,$2,$2,1,$4);
      $38 = HEAP8[$34>>0]|0;
      $39 = ($38<<24>>24)==(0);
      if (!($39)) {
       $$283$off0 = $$081$off0;
       label = 20;
       break;
      }
      $40 = HEAP8[$33>>0]|0;
      $41 = ($40<<24>>24)==(0);
      do {
       if ($41) {
        $$182$off0 = $$081$off0;$$186$off0 = $$085$off0;
       } else {
        $42 = HEAP8[$32>>0]|0;
        $43 = ($42<<24>>24)==(0);
        if ($43) {
         $49 = HEAP32[$35>>2]|0;
         $50 = $49 & 1;
         $51 = ($50|0)==(0);
         if ($51) {
          $$283$off0 = 1;
          label = 20;
          break L34;
         } else {
          $$182$off0 = 1;$$186$off0 = $$085$off0;
          break;
         }
        }
        $44 = HEAP32[$36>>2]|0;
        $45 = ($44|0)==(1);
        if ($45) {
         label = 25;
         break L34;
        }
        $46 = HEAP32[$35>>2]|0;
        $47 = $46 & 2;
        $48 = ($47|0)==(0);
        if ($48) {
         label = 25;
         break L34;
        } else {
         $$182$off0 = 1;$$186$off0 = 1;
        }
       }
      } while(0);
      $52 = ((($$084)) + 8|0);
      $$081$off0 = $$182$off0;$$084 = $52;$$085$off0 = $$186$off0;
     }
     do {
      if ((label|0) == 20) {
       if (!($$085$off0)) {
        HEAP32[$19>>2] = $2;
        $53 = ((($1)) + 40|0);
        $54 = HEAP32[$53>>2]|0;
        $55 = (($54) + 1)|0;
        HEAP32[$53>>2] = $55;
        $56 = ((($1)) + 36|0);
        $57 = HEAP32[$56>>2]|0;
        $58 = ($57|0)==(1);
        if ($58) {
         $59 = HEAP32[$36>>2]|0;
         $60 = ($59|0)==(2);
         if ($60) {
          HEAP8[$34>>0] = 1;
          if ($$283$off0) {
           label = 25;
           break;
          } else {
           $61 = 4;
           break;
          }
         }
        }
       }
       if ($$283$off0) {
        label = 25;
       } else {
        $61 = 4;
       }
      }
     } while(0);
     if ((label|0) == 25) {
      $61 = 3;
     }
     HEAP32[$25>>2] = $61;
     break;
    }
   }
   $22 = ($3|0)==(1);
   if ($22) {
    $23 = ((($1)) + 32|0);
    HEAP32[$23>>2] = 1;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 8|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($0|0)==($5|0);
 L1: do {
  if ($6) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0,$1,$2,$3);
  } else {
   $7 = ((($0)) + 16|0);
   $8 = ((($0)) + 12|0);
   $9 = HEAP32[$8>>2]|0;
   $10 = (((($0)) + 16|0) + ($9<<3)|0);
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($7,$1,$2,$3);
   $11 = ($9|0)>(1);
   if ($11) {
    $12 = ((($0)) + 24|0);
    $13 = ((($1)) + 54|0);
    $$0 = $12;
    while(1) {
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0,$1,$2,$3);
     $14 = HEAP8[$13>>0]|0;
     $15 = ($14<<24>>24)==(0);
     if (!($15)) {
      break L1;
     }
     $16 = ((($$0)) + 8|0);
     $17 = ($16>>>0)<($10>>>0);
     if ($17) {
      $$0 = $16;
     } else {
      break;
     }
    }
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($0)) + 4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = $5 >> 8;
 $7 = $5 & 1;
 $8 = ($7|0)==(0);
 if ($8) {
  $$0 = $6;
 } else {
  $9 = HEAP32[$2>>2]|0;
  $10 = (($9) + ($6)|0);
  $11 = HEAP32[$10>>2]|0;
  $$0 = $11;
 }
 $12 = HEAP32[$0>>2]|0;
 $13 = HEAP32[$12>>2]|0;
 $14 = ((($13)) + 28|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = (($2) + ($$0)|0);
 $17 = $5 & 2;
 $18 = ($17|0)!=(0);
 $19 = $18 ? $3 : 2;
 FUNCTION_TABLE_viiii[$15 & 127]($12,$1,$16,$19);
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $6 = ((($0)) + 4|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = $7 >> 8;
 $9 = $7 & 1;
 $10 = ($9|0)==(0);
 if ($10) {
  $$0 = $8;
 } else {
  $11 = HEAP32[$3>>2]|0;
  $12 = (($11) + ($8)|0);
  $13 = HEAP32[$12>>2]|0;
  $$0 = $13;
 }
 $14 = HEAP32[$0>>2]|0;
 $15 = HEAP32[$14>>2]|0;
 $16 = ((($15)) + 20|0);
 $17 = HEAP32[$16>>2]|0;
 $18 = (($3) + ($$0)|0);
 $19 = $7 & 2;
 $20 = ($19|0)!=(0);
 $21 = $20 ? $4 : 2;
 FUNCTION_TABLE_viiiiii[$17 & 127]($14,$1,$2,$18,$21,$5);
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($0)) + 4|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = $6 >> 8;
 $8 = $6 & 1;
 $9 = ($8|0)==(0);
 if ($9) {
  $$0 = $7;
 } else {
  $10 = HEAP32[$2>>2]|0;
  $11 = (($10) + ($7)|0);
  $12 = HEAP32[$11>>2]|0;
  $$0 = $12;
 }
 $13 = HEAP32[$0>>2]|0;
 $14 = HEAP32[$13>>2]|0;
 $15 = ((($14)) + 24|0);
 $16 = HEAP32[$15>>2]|0;
 $17 = (($2) + ($$0)|0);
 $18 = $6 & 2;
 $19 = ($18|0)!=(0);
 $20 = $19 ? $3 : 2;
 FUNCTION_TABLE_viiiii[$16 & 63]($13,$1,$17,$20,$4);
 return;
}
function __ZNSt9bad_allocC2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = (1476);
 return;
}
function __ZSt15get_new_handlerv() {
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[1840]|0;HEAP32[1840] = (($0+0)|0);
 $1 = $0;
 return ($1|0);
}
function ___cxa_can_catch($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = sp;
 $4 = HEAP32[$2>>2]|0;
 HEAP32[$3>>2] = $4;
 $5 = HEAP32[$0>>2]|0;
 $6 = ((($5)) + 16|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (FUNCTION_TABLE_iiii[$7 & 127]($0,$1,$3)|0);
 $9 = $8&1;
 if ($8) {
  $10 = HEAP32[$3>>2]|0;
  HEAP32[$2>>2] = $10;
 }
 STACKTOP = sp;return ($9|0);
}
function ___cxa_is_pointer_type($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 if ($1) {
  $4 = 0;
 } else {
  $2 = (___dynamic_cast($0,320,440,0)|0);
  $phitmp = ($2|0)!=(0|0);
  $4 = $phitmp;
 }
 $3 = $4&1;
 return ($3|0);
}
function runPostSets() {
}
function _i64Subtract(a, b, c, d) {
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a - c)>>>0;
    h = (b - d)>>>0;
    h = (b - d - (((c>>>0) > (a>>>0))|0))>>>0; // Borrow one from high word to low word on underflow.
    return ((tempRet0 = h,l|0)|0);
}
function _i64Add(a, b, c, d) {
    /*
      x = a + b*2^32
      y = c + d*2^32
      result = l + h*2^32
    */
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a + c)>>>0;
    h = (b + d + (((l>>>0) < (a>>>0))|0))>>>0; // Add carry from low word to high word on overflow.
    return ((tempRet0 = h,l|0)|0);
}
function _memset(ptr, value, num) {
    ptr = ptr|0; value = value|0; num = num|0;
    var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
    end = (ptr + num)|0;

    value = value & 0xff;
    if ((num|0) >= 67 /* 64 bytes for an unrolled loop + 3 bytes for unaligned head*/) {
      while ((ptr&3) != 0) {
        HEAP8[((ptr)>>0)]=value;
        ptr = (ptr+1)|0;
      }

      aligned_end = (end & -4)|0;
      block_aligned_end = (aligned_end - 64)|0;
      value4 = value | (value << 8) | (value << 16) | (value << 24);

      while((ptr|0) <= (block_aligned_end|0)) {
        HEAP32[((ptr)>>2)]=value4;
        HEAP32[(((ptr)+(4))>>2)]=value4;
        HEAP32[(((ptr)+(8))>>2)]=value4;
        HEAP32[(((ptr)+(12))>>2)]=value4;
        HEAP32[(((ptr)+(16))>>2)]=value4;
        HEAP32[(((ptr)+(20))>>2)]=value4;
        HEAP32[(((ptr)+(24))>>2)]=value4;
        HEAP32[(((ptr)+(28))>>2)]=value4;
        HEAP32[(((ptr)+(32))>>2)]=value4;
        HEAP32[(((ptr)+(36))>>2)]=value4;
        HEAP32[(((ptr)+(40))>>2)]=value4;
        HEAP32[(((ptr)+(44))>>2)]=value4;
        HEAP32[(((ptr)+(48))>>2)]=value4;
        HEAP32[(((ptr)+(52))>>2)]=value4;
        HEAP32[(((ptr)+(56))>>2)]=value4;
        HEAP32[(((ptr)+(60))>>2)]=value4;
        ptr = (ptr + 64)|0;
      }

      while ((ptr|0) < (aligned_end|0) ) {
        HEAP32[((ptr)>>2)]=value4;
        ptr = (ptr+4)|0;
      }
    }
    // The remaining bytes.
    while ((ptr|0) < (end|0)) {
      HEAP8[((ptr)>>0)]=value;
      ptr = (ptr+1)|0;
    }
    return (end-num)|0;
}
function _bitshift64Shl(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = (high << bits) | ((low&(ander << (32 - bits))) >>> (32 - bits));
      return low << bits;
    }
    tempRet0 = low << (bits - 32);
    return 0;
}
function _bitshift64Lshr(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = high >>> bits;
      return (low >>> bits) | ((high&ander) << (32 - bits));
    }
    tempRet0 = 0;
    return (high >>> (bits - 32))|0;
}
function _memcpy(dest, src, num) {
    dest = dest|0; src = src|0; num = num|0;
    var ret = 0;
    var aligned_dest_end = 0;
    var block_aligned_dest_end = 0;
    var dest_end = 0;
    // Test against a benchmarked cutoff limit for when HEAPU8.set() becomes faster to use.
    if ((num|0) >=
      8192
    ) {
      return _emscripten_memcpy_big(dest|0, src|0, num|0)|0;
    }

    ret = dest|0;
    dest_end = (dest + num)|0;
    if ((dest&3) == (src&3)) {
      // The initial unaligned < 4-byte front.
      while (dest & 3) {
        if ((num|0) == 0) return ret|0;
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        dest = (dest+1)|0;
        src = (src+1)|0;
        num = (num-1)|0;
      }
      aligned_dest_end = (dest_end & -4)|0;
      block_aligned_dest_end = (aligned_dest_end - 64)|0;
      while ((dest|0) <= (block_aligned_dest_end|0) ) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        HEAP32[(((dest)+(4))>>2)]=((HEAP32[(((src)+(4))>>2)])|0);
        HEAP32[(((dest)+(8))>>2)]=((HEAP32[(((src)+(8))>>2)])|0);
        HEAP32[(((dest)+(12))>>2)]=((HEAP32[(((src)+(12))>>2)])|0);
        HEAP32[(((dest)+(16))>>2)]=((HEAP32[(((src)+(16))>>2)])|0);
        HEAP32[(((dest)+(20))>>2)]=((HEAP32[(((src)+(20))>>2)])|0);
        HEAP32[(((dest)+(24))>>2)]=((HEAP32[(((src)+(24))>>2)])|0);
        HEAP32[(((dest)+(28))>>2)]=((HEAP32[(((src)+(28))>>2)])|0);
        HEAP32[(((dest)+(32))>>2)]=((HEAP32[(((src)+(32))>>2)])|0);
        HEAP32[(((dest)+(36))>>2)]=((HEAP32[(((src)+(36))>>2)])|0);
        HEAP32[(((dest)+(40))>>2)]=((HEAP32[(((src)+(40))>>2)])|0);
        HEAP32[(((dest)+(44))>>2)]=((HEAP32[(((src)+(44))>>2)])|0);
        HEAP32[(((dest)+(48))>>2)]=((HEAP32[(((src)+(48))>>2)])|0);
        HEAP32[(((dest)+(52))>>2)]=((HEAP32[(((src)+(52))>>2)])|0);
        HEAP32[(((dest)+(56))>>2)]=((HEAP32[(((src)+(56))>>2)])|0);
        HEAP32[(((dest)+(60))>>2)]=((HEAP32[(((src)+(60))>>2)])|0);
        dest = (dest+64)|0;
        src = (src+64)|0;
      }
      while ((dest|0) < (aligned_dest_end|0) ) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
      }
    } else {
      // In the unaligned copy case, unroll a bit as well.
      aligned_dest_end = (dest_end - 4)|0;
      while ((dest|0) < (aligned_dest_end|0) ) {
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        HEAP8[(((dest)+(1))>>0)]=((HEAP8[(((src)+(1))>>0)])|0);
        HEAP8[(((dest)+(2))>>0)]=((HEAP8[(((src)+(2))>>0)])|0);
        HEAP8[(((dest)+(3))>>0)]=((HEAP8[(((src)+(3))>>0)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
      }
    }
    // The remaining unaligned < 4 byte tail.
    while ((dest|0) < (dest_end|0)) {
      HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
      dest = (dest+1)|0;
      src = (src+1)|0;
    }
    return ret|0;
}
function _llvm_cttz_i32(x) {
    x = x|0;
    var ret = 0;
    ret = ((HEAP8[(((cttz_i8)+(x & 0xff))>>0)])|0);
    if ((ret|0) < 8) return ret|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 8)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 8)|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 16)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 16)|0;
    return (((HEAP8[(((cttz_i8)+(x >>> 24))>>0)])|0) + 24)|0;
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    $rem = $rem | 0;
    var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $49 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $86 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $117 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $147 = 0, $149 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $152 = 0, $154$0 = 0, $r_sroa_0_0_extract_trunc = 0, $r_sroa_1_4_extract_trunc = 0, $155 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $q_sroa_0_0_insert_insert77$1 = 0, $_0$0 = 0, $_0$1 = 0;
    $n_sroa_0_0_extract_trunc = $a$0;
    $n_sroa_1_4_extract_shift$0 = $a$1;
    $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0;
    $d_sroa_0_0_extract_trunc = $b$0;
    $d_sroa_1_4_extract_shift$0 = $b$1;
    $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0;
    if (($n_sroa_1_4_extract_trunc | 0) == 0) {
      $4 = ($rem | 0) != 0;
      if (($d_sroa_1_4_extract_trunc | 0) == 0) {
        if ($4) {
          HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
          HEAP32[$rem + 4 >> 2] = 0;
        }
        $_0$1 = 0;
        $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      } else {
        if (!$4) {
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        HEAP32[$rem >> 2] = $a$0 & -1;
        HEAP32[$rem + 4 >> 2] = $a$1 & 0;
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
    }
    $17 = ($d_sroa_1_4_extract_trunc | 0) == 0;
    do {
      if (($d_sroa_0_0_extract_trunc | 0) == 0) {
        if ($17) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
            HEAP32[$rem + 4 >> 2] = 0;
          }
          $_0$1 = 0;
          $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        if (($n_sroa_0_0_extract_trunc | 0) == 0) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = 0;
            HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0);
          }
          $_0$1 = 0;
          $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $37 = $d_sroa_1_4_extract_trunc - 1 | 0;
        if (($37 & $d_sroa_1_4_extract_trunc | 0) == 0) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = 0 | $a$0 & -1;
            HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0;
          }
          $_0$1 = 0;
          $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0);
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $49 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
        $51 = $49 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
        if ($51 >>> 0 <= 30) {
          $57 = $51 + 1 | 0;
          $58 = 31 - $51 | 0;
          $sr_1_ph = $57;
          $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0);
          $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0);
          $q_sroa_0_1_ph = 0;
          $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58;
          break;
        }
        if (($rem | 0) == 0) {
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        HEAP32[$rem >> 2] = 0 | $a$0 & -1;
        HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      } else {
        if (!$17) {
          $117 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
          $119 = $117 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
          if ($119 >>> 0 <= 31) {
            $125 = $119 + 1 | 0;
            $126 = 31 - $119 | 0;
            $130 = $119 - 31 >> 31;
            $sr_1_ph = $125;
            $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126;
            $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130;
            $q_sroa_0_1_ph = 0;
            $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126;
            break;
          }
          if (($rem | 0) == 0) {
            $_0$1 = 0;
            $_0$0 = 0;
            return (tempRet0 = $_0$1, $_0$0) | 0;
          }
          HEAP32[$rem >> 2] = 0 | $a$0 & -1;
          HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $66 = $d_sroa_0_0_extract_trunc - 1 | 0;
        if (($66 & $d_sroa_0_0_extract_trunc | 0) != 0) {
          $86 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 | 0;
          $88 = $86 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
          $89 = 64 - $88 | 0;
          $91 = 32 - $88 | 0;
          $92 = $91 >> 31;
          $95 = $88 - 32 | 0;
          $105 = $95 >> 31;
          $sr_1_ph = $88;
          $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105;
          $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0);
          $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92;
          $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31;
          break;
        }
        if (($rem | 0) != 0) {
          HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc;
          HEAP32[$rem + 4 >> 2] = 0;
        }
        if (($d_sroa_0_0_extract_trunc | 0) == 1) {
          $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
          $_0$0 = 0 | $a$0 & -1;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        } else {
          $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0;
          $_0$1 = 0 | $n_sroa_1_4_extract_trunc >>> ($78 >>> 0);
          $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
      }
    } while (0);
    if (($sr_1_ph | 0) == 0) {
      $q_sroa_1_1_lcssa = $q_sroa_1_1_ph;
      $q_sroa_0_1_lcssa = $q_sroa_0_1_ph;
      $r_sroa_1_1_lcssa = $r_sroa_1_1_ph;
      $r_sroa_0_1_lcssa = $r_sroa_0_1_ph;
      $carry_0_lcssa$1 = 0;
      $carry_0_lcssa$0 = 0;
    } else {
      $d_sroa_0_0_insert_insert99$0 = 0 | $b$0 & -1;
      $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0;
      $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0;
      $137$1 = tempRet0;
      $q_sroa_1_1198 = $q_sroa_1_1_ph;
      $q_sroa_0_1199 = $q_sroa_0_1_ph;
      $r_sroa_1_1200 = $r_sroa_1_1_ph;
      $r_sroa_0_1201 = $r_sroa_0_1_ph;
      $sr_1202 = $sr_1_ph;
      $carry_0203 = 0;
      while (1) {
        $147 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1;
        $149 = $carry_0203 | $q_sroa_0_1199 << 1;
        $r_sroa_0_0_insert_insert42$0 = 0 | ($r_sroa_0_1201 << 1 | $q_sroa_1_1198 >>> 31);
        $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0;
        _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0;
        $150$1 = tempRet0;
        $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1;
        $152 = $151$0 & 1;
        $154$0 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0;
        $r_sroa_0_0_extract_trunc = $154$0;
        $r_sroa_1_4_extract_trunc = tempRet0;
        $155 = $sr_1202 - 1 | 0;
        if (($155 | 0) == 0) {
          break;
        } else {
          $q_sroa_1_1198 = $147;
          $q_sroa_0_1199 = $149;
          $r_sroa_1_1200 = $r_sroa_1_4_extract_trunc;
          $r_sroa_0_1201 = $r_sroa_0_0_extract_trunc;
          $sr_1202 = $155;
          $carry_0203 = $152;
        }
      }
      $q_sroa_1_1_lcssa = $147;
      $q_sroa_0_1_lcssa = $149;
      $r_sroa_1_1_lcssa = $r_sroa_1_4_extract_trunc;
      $r_sroa_0_1_lcssa = $r_sroa_0_0_extract_trunc;
      $carry_0_lcssa$1 = 0;
      $carry_0_lcssa$0 = $152;
    }
    $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa;
    $q_sroa_0_0_insert_ext75$1 = 0;
    $q_sroa_0_0_insert_insert77$1 = $q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1;
    if (($rem | 0) != 0) {
      HEAP32[$rem >> 2] = 0 | $r_sroa_0_1_lcssa;
      HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa | 0;
    }
    $_0$1 = (0 | $q_sroa_0_0_insert_ext75$0) >>> 31 | $q_sroa_0_0_insert_insert77$1 << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1;
    $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0;
    return (tempRet0 = $_0$1, $_0$0) | 0;
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $1$0 = 0;
    $1$0 = ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0;
    return $1$0 | 0;
}
function _sbrk(increment) {
    increment = increment|0;
    var oldDynamicTop = 0;
    var oldDynamicTopOnChange = 0;
    var newDynamicTop = 0;
    var totalMemory = 0;
    increment = ((increment + 15) & -16)|0;
    oldDynamicTop = HEAP32[DYNAMICTOP_PTR>>2]|0;
    newDynamicTop = oldDynamicTop + increment | 0;

    if (((increment|0) > 0 & (newDynamicTop|0) < (oldDynamicTop|0)) // Detect and fail if we would wrap around signed 32-bit int.
      | (newDynamicTop|0) < 0) { // Also underflow, sbrk() should be able to be used to subtract.
      abortOnCannotGrowMemory()|0;
      ___setErrNo(12);
      return -1;
    }

    HEAP32[DYNAMICTOP_PTR>>2] = newDynamicTop;
    totalMemory = getTotalMemory()|0;
    if ((newDynamicTop|0) > (totalMemory|0)) {
      if ((enlargeMemory()|0) == 0) {
        ___setErrNo(12);
        HEAP32[DYNAMICTOP_PTR>>2] = oldDynamicTop;
        return -1;
      }
    }
    return oldDynamicTop|0;
}
function _memmove(dest, src, num) {
    dest = dest|0; src = src|0; num = num|0;
    var ret = 0;
    if (((src|0) < (dest|0)) & ((dest|0) < ((src + num)|0))) {
      // Unlikely case: Copy backwards in a safe manner
      ret = dest;
      src = (src + num)|0;
      dest = (dest + num)|0;
      while ((num|0) > 0) {
        dest = (dest - 1)|0;
        src = (src - 1)|0;
        num = (num - 1)|0;
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
      }
      dest = ret;
    } else {
      _memcpy(dest, src, num) | 0;
    }
    return dest | 0;
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $rem = 0, __stackBase__ = 0;
    __stackBase__ = STACKTOP;
    STACKTOP = STACKTOP + 16 | 0;
    $rem = __stackBase__ | 0;
    ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0;
    STACKTOP = __stackBase__;
    return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0;
}
function _llvm_bswap_i32(x) {
    x = x|0;
    return (((x&0xff)<<24) | (((x>>8)&0xff)<<16) | (((x>>16)&0xff)<<8) | (x>>>24))|0;
}

  
function dynCall_iiii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  return FUNCTION_TABLE_iiii[index&127](a1|0,a2|0,a3|0)|0;
}


function dynCall_viiiii(index,a1,a2,a3,a4,a5) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0;
  FUNCTION_TABLE_viiiii[index&63](a1|0,a2|0,a3|0,a4|0,a5|0);
}


function dynCall_i(index) {
  index = index|0;
  
  return FUNCTION_TABLE_i[index&127]()|0;
}


function dynCall_vi(index,a1) {
  index = index|0;
  a1=a1|0;
  FUNCTION_TABLE_vi[index&127](a1|0);
}


function dynCall_vii(index,a1,a2) {
  index = index|0;
  a1=a1|0; a2=a2|0;
  FUNCTION_TABLE_vii[index&127](a1|0,a2|0);
}


function dynCall_ii(index,a1) {
  index = index|0;
  a1=a1|0;
  return FUNCTION_TABLE_ii[index&127](a1|0)|0;
}


function dynCall_viii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  FUNCTION_TABLE_viii[index&127](a1|0,a2|0,a3|0);
}


function dynCall_v(index) {
  index = index|0;
  
  FUNCTION_TABLE_v[index&127]();
}


function dynCall_iiiii(index,a1,a2,a3,a4) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0;
  return FUNCTION_TABLE_iiiii[index&127](a1|0,a2|0,a3|0,a4|0)|0;
}


function dynCall_viiiiii(index,a1,a2,a3,a4,a5,a6) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0; a6=a6|0;
  FUNCTION_TABLE_viiiiii[index&127](a1|0,a2|0,a3|0,a4|0,a5|0,a6|0);
}


function dynCall_iii(index,a1,a2) {
  index = index|0;
  a1=a1|0; a2=a2|0;
  return FUNCTION_TABLE_iii[index&127](a1|0,a2|0)|0;
}


function dynCall_iiiiii(index,a1,a2,a3,a4,a5) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0;
  return FUNCTION_TABLE_iiiiii[index&63](a1|0,a2|0,a3|0,a4|0,a5|0)|0;
}


function dynCall_viiii(index,a1,a2,a3,a4) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0;
  FUNCTION_TABLE_viiii[index&127](a1|0,a2|0,a3|0,a4|0);
}

function b0(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(0);return 0;
}
function b1(p0,p1,p2,p3,p4) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0; nullFunc_viiiii(1);
}
function b2() {
 ; nullFunc_i(2);return 0;
}
function b3(p0) {
 p0 = p0|0; nullFunc_vi(3);
}
function __emval_decref__wrapper(p0) {
 p0 = p0|0; __emval_decref(p0|0);
}
function __embind_finalize_value_array__wrapper(p0) {
 p0 = p0|0; __embind_finalize_value_array(p0|0);
}
function __embind_finalize_value_object__wrapper(p0) {
 p0 = p0|0; __embind_finalize_value_object(p0|0);
}
function b4(p0,p1) {
 p0 = p0|0;p1 = p1|0; nullFunc_vii(4);
}
function b5(p0) {
 p0 = p0|0; nullFunc_ii(5);return 0;
}
function b6(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_viii(6);
}
function __emval_set_property__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; __emval_set_property(p0|0,p1|0,p2|0);
}
function b7() {
 ; nullFunc_v(7);
}
function ___cxa_end_catch__wrapper() {
 ; ___cxa_end_catch();
}
function b8(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; nullFunc_iiiii(8);return 0;
}
function __emval_new__wrapper(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; return __emval_new(p0|0,p1|0,p2|0,p3|0)|0;
}
function b9(p0,p1,p2,p3,p4,p5) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0; nullFunc_viiiiii(9);
}
function __embind_register_value_array__wrapper(p0,p1,p2,p3,p4,p5) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0; __embind_register_value_array(p0|0,p1|0,p2|0,p3|0,p4|0,p5|0);
}
function __embind_register_value_object__wrapper(p0,p1,p2,p3,p4,p5) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0; __embind_register_value_object(p0|0,p1|0,p2|0,p3|0,p4|0,p5|0);
}
function b10(p0,p1) {
 p0 = p0|0;p1 = p1|0; nullFunc_iii(10);return 0;
}
function b11(p0,p1,p2,p3,p4) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0; nullFunc_iiiiii(11);return 0;
}
function b12(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; nullFunc_viiii(12);
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_iiii = [b0,b0,___stdout_write,___stdio_seek,___stdio_write,b0,b0,b0,b0,b0,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,__ZNK10__cxxabiv123__fundamental_type_info9can_catchEPKNS_16__shim_type_infoERPv,b0
,__ZNK10__cxxabiv119__pointer_type_info9can_catchEPKNS_16__shim_type_infoERPv,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0
,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,__ZN10emscripten12value_objectI5BlockE5fieldIS1_4Vec3EERS2_PKcMT_T0_,__ZN10emscripten12value_objectI5BlockE5fieldIS1_NSt3__212basic_stringIcNS4_11char_traitsIcEENS4_9allocatorIcEEEEEERS2_PKcMT_T0_,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0
,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,__ZN10emscripten8internal15FunctionInvokerIPFNS_3valERKNSt3__26vectorI5BlockNS3_9allocatorIS5_EEEEjES2_SA_JjEE6invokeEPSC_PS8_j,__ZN10emscripten8internal12VectorAccessINSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE3setERS7_jRKS4_,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0
,b0,b0,b0,b0,b0,b0,b0,b0,b0];
var FUNCTION_TABLE_viiiii = [b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b1,b1,b1,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1
,b1,b1,b1,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1
,b1,b1,b1,b1,b1];
var FUNCTION_TABLE_i = [b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,__ZN10emscripten8internal15raw_constructorI4Vec3JEEEPT_DpNS0_11BindingTypeIT0_E8WireTypeE,b2,__ZN10emscripten8internal6TypeIDI4Vec3E3getEv,b2,b2,b2,b2,__ZN10emscripten8internal15raw_constructorI5BlockJEEEPT_DpNS0_11BindingTypeIT0_E8WireTypeE,b2,__ZN10emscripten8internal6TypeIDI5BlockE3getEv,b2,b2,b2,b2,b2,b2
,b2,b2,b2,b2,__ZN10emscripten8internal12operator_newINSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEJEEEPT_DpOT0_,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,___cxa_get_globals_fast,b2,b2,b2,b2,b2,b2,b2,b2];
var FUNCTION_TABLE_vi = [b3,b3,b3,b3,b3,b3,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,b3,b3,b3,b3,__ZN10__cxxabiv120__si_class_type_infoD0Ev,b3,b3,b3,__ZNSt9bad_allocD2Ev,__ZNSt9bad_allocD0Ev,b3,__ZNSt11logic_errorD2Ev,__ZNSt11logic_errorD0Ev,b3,__ZNSt12length_errorD0Ev,__ZNSt12out_of_rangeD0Ev,__ZN10__cxxabiv123__fundamental_type_infoD0Ev,b3,__ZN10__cxxabiv119__pointer_type_infoD0Ev
,b3,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,b3,b3,b3,b3,b3,b3,b3,__ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEED2Ev,b3,b3,__ZNSt3__26vectorIfNS_9allocatorIfEEED2Ev,b3,b3,b3,__ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEED2Ev,b3,b3,b3,__ZN10emscripten3valD2Ev,__emval_decref__wrapper,b3,b3,b3,b3,b3,b3,b3,b3
,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,__ZN10emscripten8internal14raw_destructorI4Vec3EEvPT_,b3,b3,b3,b3,__embind_finalize_value_array__wrapper,b3,__ZN10emscripten8internal14raw_destructorI5BlockEEvPT_,b3,b3,b3,b3,b3,b3,__embind_finalize_value_object__wrapper,b3,b3,b3,__ZN10emscripten8internal14raw_destructorINSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEEEvPT_,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv
,b3,b3,b3,b3,b3,b3,b3,b3,b3];
var FUNCTION_TABLE_vii = [b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4
,b4,b4,b4,b4,b4,__ZNSt3__26vectorIiNS_9allocatorIiEEE8allocateEj,b4,__ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE8allocateEj,b4,b4,__ZNSt3__26vectorIfNS_9allocatorIfEEE8allocateEj,b4,b4,__ZNSt3__26vectorIfNS_9allocatorIfEEEC2ERKS3_,__ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE8allocateEj,b4,b4,b4,b4,b4,b4,b4,__ZN5BlockC2ERKS_,b4,b4,__ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE21__push_back_slow_pathIS3_EEvOT_,__ZNSt3__26vectorIiNS_9allocatorIiEEEC2ERKS3_,__ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE21__push_back_slow_pathIRKS3_EEvOT_,__ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEC2ERKS5_,b4
,__ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE21__push_back_slow_pathIS3_EEvOT_,b4,b4,b4,b4,b4,b4,__ZN10emscripten3valC2IRKiEEOT_,b4,__ZN10emscripten3valC2IRKfEEOT_,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4
,__ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEE9push_backERKS1_,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,__ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE26__swap_out_circular_bufferERNS_14__split_bufferIS3_RS4_EE,__ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE26__swap_out_circular_bufferERNS_14__split_bufferIS3_RS4_EE,__ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE7reserveEj,__ZNKSt3__26vectorI5BlockNS_9allocatorIS1_EEE17__annotate_shrinkEj,__ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEE26__swap_out_circular_bufferERNS_14__split_bufferIS1_RS3_EE,b4,b4,__ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEE8allocateEj,b4,__ZNSt11logic_errorC2EPKc,__ZNSt3__218__libcpp_refstringC2EPKc,b4,b4,b4
,b4,_abort_message,b4,b4,b4,b4,b4,b4,b4];
var FUNCTION_TABLE_ii = [b5,___stdio_close,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,__ZNKSt9bad_alloc4whatEv,b5,b5,__ZNKSt11logic_error4whatEv,b5,b5,b5,b5,b5
,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,__ZNSt3__211char_traitsIcE6lengthEPKc,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5
,b5,__ZNK10emscripten3val4new_IJEEES0_DpOT_,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,__Z8chunkifyNSt3__26vectorI5BlockNS_9allocatorIS1_EEEE,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5
,b5,b5,__ZN10emscripten8internal13getActualTypeINSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEEEPKvPT_,b5,b5,__ZN10emscripten8internal7InvokerIPNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEJEE6invokeEPFS8_vE,b5,b5,__ZNKSt3__26vectorI5BlockNS_9allocatorIS1_EEE4sizeEv,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,__ZN10emscripten8internal11BindingTypeINS_3valEE10toWireTypeERKS2_,b5,b5,b5,b5,__Znwj,b5,b5
,b5,b5,b5,b5,b5,b5,b5,b5,b5];
var FUNCTION_TABLE_viii = [b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6
,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,__Z7getFace4Vec34Side,b6,b6,b6,b6,__Z10getTextureNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEE4Side
,b6,b6,b6,__ZN10emscripten3val3setIiiEEvRKT_RKT0_,__ZN10emscripten3val3setIifEEvRKT_RKT0_,__ZN10emscripten3val3setIiEEvRKT_RKS0_,b6,b6,__emval_set_property__wrapper,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,__ZN10emscripten8internal12MemberAccessI4Vec3iE7setWireIS2_EEvRKMS2_iRT_i,b6,b6,b6,b6,b6,b6,__ZN10emscripten8internal12MemberAccessI5Block4Vec3E7setWireIS2_EEvRKMS2_S3_RT_PS3_,b6,__ZN10emscripten8internal12MemberAccessI5BlockNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEE7setWireIS2_EEvRKMS2_S9_RT_PNS0_11BindingTypeIS9_EUt_E,b6
,b6,__ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEE6resizeEjRKS1_,b6,b6,b6,b6,__ZN10emscripten8internal13MethodInvokerIMNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEFvRKS4_EvPS7_JS9_EE6invokeERKSB_SC_PS4_,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,__ZNSt3__214__split_bufferI5BlockRNS_9allocatorIS1_EEE18__construct_at_endEjRKS1_,b6,b6,b6,b6,b6,b6,b6,b6
,b6,b6,b6,b6,b6,b6,b6,b6,b6];
var FUNCTION_TABLE_v = [b7,b7,b7,b7,b7,__ZL25default_terminate_handlerv,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7
,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7
,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7
,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev,b7
,b7,b7,___cxa_end_catch__wrapper,b7,b7,b7,b7,b7,b7];
var FUNCTION_TABLE_iiiii = [b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8
,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,__Z12shouldRenderPPPbiii,b8,b8,b8,b8,b8,b8
,b8,b8,b8,b8,b8,b8,__emval_new__wrapper,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8
,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,__ZN10emscripten8internal15FunctionInvokerIPFbRNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEjRKS4_EbS8_JjSA_EE6invokeEPSC_PS7_jPS4_,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8
,b8,b8,b8,b8,b8,b8,b8,b8,b8];
var FUNCTION_TABLE_viiiiii = [b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b9,b9,b9,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9
,b9,b9,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9
,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,__embind_register_value_array__wrapper,b9,b9,b9,b9,b9,b9,__embind_register_value_object__wrapper,b9,b9,b9,b9,b9
,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9
,b9,b9,b9,b9,b9,b9,b9,b9,b9];
var FUNCTION_TABLE_iii = [b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10
,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10
,b10,b10,__ZNK10emscripten3val4new_IJiEEES0_DpOT_,b10,b10,b10,b10,b10,b10,b10,__ZN10emscripten11value_arrayI4Vec3E7elementIS1_iEERS2_MT_T0_,b10,b10,b10,b10,b10,b10,b10,__ZN10emscripten8internal12MemberAccessI4Vec3iE7getWireIS2_EEiRKMS2_iRKT_,b10,b10,b10,b10,b10,b10,__ZN10emscripten8internal12MemberAccessI5Block4Vec3E7getWireIS2_EEPS3_RKMS2_S3_RKT_,b10,__ZN10emscripten8internal12MemberAccessI5BlockNSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEE7getWireIS2_EEPNS0_11BindingTypeIS9_EUt_ERKMS2_S9_RKT_,b10,b10
,b10,b10,b10,b10,b10,b10,b10,b10,b10,__ZN10emscripten8internal13MethodInvokerIMNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEKFjvEjPKS7_JEE6invokeERKS9_SB_,__ZN10emscripten8internal12VectorAccessINSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEE3getERKS7_j,b10,b10,b10,__ZN10emscripten8internal7InvokerINS_3valEJNSt3__26vectorI5BlockNS3_9allocatorIS5_EEEEEE6invokeEPFS2_S8_EPS8_,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10
,b10,b10,b10,b10,b10,b10,b10,b10,b10];
var FUNCTION_TABLE_iiiiii = [b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11
,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,__ZNKSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE7compareEjjPKcj,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11
,b11,b11,b11,b11,b11];
var FUNCTION_TABLE_viiii = [b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b12,b12,b12,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12
,b12,b12,b12,b12,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b12,__ZNSt3__26vectorIiNS_9allocatorIiEEE18__construct_at_endIPKiEENS_9enable_ifIXsr21__is_forward_iteratorIT_EE5valueEvE4typeES8_S8_j,b12,__ZNSt3__26vectorINS0_IiNS_9allocatorIiEEEENS1_IS3_EEE18__construct_at_endIPKS3_EENS_9enable_ifIXsr21__is_forward_iteratorIT_EE5valueEvE4typeESA_SA_j,b12,b12,__ZNSt3__26vectorIfNS_9allocatorIfEEE18__construct_at_endIPKfEENS_9enable_ifIXsr21__is_forward_iteratorIT_EE5valueEvE4typeES8_S8_j,b12,b12,b12,__ZNSt3__26vectorINS0_IfNS_9allocatorIfEEEENS1_IS3_EEE18__construct_at_endIPKS3_EENS_9enable_ifIXsr21__is_forward_iteratorIT_EE5valueEvE4typeESA_SA_j,b12,__ZNSt3__26vectorIfNS_9allocatorIfEEE18__construct_at_endIPfEENS_9enable_ifIXsr21__is_forward_iteratorIT_EE5valueEvE4typeES7_S7_j,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12
,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12
,b12,b12,b12,b12,b12,b12,b12,__ZN10emscripten8internal13MethodInvokerIMNSt3__26vectorI5BlockNS2_9allocatorIS4_EEEEFvjRKS4_EvPS7_JjS9_EE6invokeERKSB_SC_jPS4_,b12,b12,b12,b12,b12,b12,b12,__ZNSt3__26vectorIiNS_9allocatorIiEEE18__construct_at_endIPiEENS_9enable_ifIXsr21__is_forward_iteratorIT_EE5valueEvE4typeES7_S7_j,b12,b12,b12,b12,b12,b12,b12,b12,__ZNSt3__26vectorI5BlockNS_9allocatorIS1_EEE18__construct_at_endIPS1_EENS_9enable_ifIXsr21__is_forward_iteratorIT_EE5valueEvE4typeES8_S8_j,b12,b12,b12,b12,b12
,b12,b12,b12,b12,b12,b12,b12,b12,b12];

  return { _llvm_cttz_i32: _llvm_cttz_i32, ___cxa_can_catch: ___cxa_can_catch, _fflush: _fflush, ___udivmoddi4: ___udivmoddi4, ___cxa_is_pointer_type: ___cxa_is_pointer_type, _i64Add: _i64Add, _memmove: _memmove, _i64Subtract: _i64Subtract, _memset: _memset, _malloc: _malloc, _emscripten_get_global_libc: _emscripten_get_global_libc, _memcpy: _memcpy, ___getTypeName: ___getTypeName, _llvm_bswap_i32: _llvm_bswap_i32, _sbrk: _sbrk, _bitshift64Lshr: _bitshift64Lshr, _free: _free, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, ___errno_location: ___errno_location, _bitshift64Shl: _bitshift64Shl, __GLOBAL__sub_I_chunks_cpp: __GLOBAL__sub_I_chunks_cpp, __GLOBAL__sub_I_bind_cpp: __GLOBAL__sub_I_bind_cpp, runPostSets: runPostSets, _emscripten_replace_memory: _emscripten_replace_memory, stackAlloc: stackAlloc, stackSave: stackSave, stackRestore: stackRestore, establishStackSpace: establishStackSpace, setTempRet0: setTempRet0, getTempRet0: getTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackSave: stackSave, stackRestore: stackRestore, establishStackSpace: establishStackSpace, setThrew: setThrew, setTempRet0: setTempRet0, getTempRet0: getTempRet0, dynCall_iiii: dynCall_iiii, dynCall_viiiii: dynCall_viiiii, dynCall_i: dynCall_i, dynCall_vi: dynCall_vi, dynCall_vii: dynCall_vii, dynCall_ii: dynCall_ii, dynCall_viii: dynCall_viii, dynCall_v: dynCall_v, dynCall_iiiii: dynCall_iiiii, dynCall_viiiiii: dynCall_viiiiii, dynCall_iii: dynCall_iii, dynCall_iiiiii: dynCall_iiiiii, dynCall_viiii: dynCall_viiii };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);

var real_stackSave = asm["stackSave"]; asm["stackSave"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_stackSave.apply(null, arguments);
};

var real_getTempRet0 = asm["getTempRet0"]; asm["getTempRet0"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_getTempRet0.apply(null, arguments);
};

var real_setThrew = asm["setThrew"]; asm["setThrew"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_setThrew.apply(null, arguments);
};

var real__bitshift64Lshr = asm["_bitshift64Lshr"]; asm["_bitshift64Lshr"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__bitshift64Lshr.apply(null, arguments);
};

var real__bitshift64Shl = asm["_bitshift64Shl"]; asm["_bitshift64Shl"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__bitshift64Shl.apply(null, arguments);
};

var real__fflush = asm["_fflush"]; asm["_fflush"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__fflush.apply(null, arguments);
};

var real____cxa_is_pointer_type = asm["___cxa_is_pointer_type"]; asm["___cxa_is_pointer_type"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____cxa_is_pointer_type.apply(null, arguments);
};

var real__llvm_cttz_i32 = asm["_llvm_cttz_i32"]; asm["_llvm_cttz_i32"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__llvm_cttz_i32.apply(null, arguments);
};

var real__sbrk = asm["_sbrk"]; asm["_sbrk"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__sbrk.apply(null, arguments);
};

var real__llvm_bswap_i32 = asm["_llvm_bswap_i32"]; asm["_llvm_bswap_i32"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__llvm_bswap_i32.apply(null, arguments);
};

var real____uremdi3 = asm["___uremdi3"]; asm["___uremdi3"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____uremdi3.apply(null, arguments);
};

var real_stackAlloc = asm["stackAlloc"]; asm["stackAlloc"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_stackAlloc.apply(null, arguments);
};

var real__i64Subtract = asm["_i64Subtract"]; asm["_i64Subtract"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__i64Subtract.apply(null, arguments);
};

var real___GLOBAL__sub_I_bind_cpp = asm["__GLOBAL__sub_I_bind_cpp"]; asm["__GLOBAL__sub_I_bind_cpp"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real___GLOBAL__sub_I_bind_cpp.apply(null, arguments);
};

var real____udivmoddi4 = asm["___udivmoddi4"]; asm["___udivmoddi4"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____udivmoddi4.apply(null, arguments);
};

var real_setTempRet0 = asm["setTempRet0"]; asm["setTempRet0"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_setTempRet0.apply(null, arguments);
};

var real__i64Add = asm["_i64Add"]; asm["_i64Add"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__i64Add.apply(null, arguments);
};

var real___GLOBAL__sub_I_chunks_cpp = asm["__GLOBAL__sub_I_chunks_cpp"]; asm["__GLOBAL__sub_I_chunks_cpp"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real___GLOBAL__sub_I_chunks_cpp.apply(null, arguments);
};

var real__emscripten_get_global_libc = asm["_emscripten_get_global_libc"]; asm["_emscripten_get_global_libc"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__emscripten_get_global_libc.apply(null, arguments);
};

var real____getTypeName = asm["___getTypeName"]; asm["___getTypeName"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____getTypeName.apply(null, arguments);
};

var real____udivdi3 = asm["___udivdi3"]; asm["___udivdi3"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____udivdi3.apply(null, arguments);
};

var real____errno_location = asm["___errno_location"]; asm["___errno_location"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____errno_location.apply(null, arguments);
};

var real____cxa_can_catch = asm["___cxa_can_catch"]; asm["___cxa_can_catch"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____cxa_can_catch.apply(null, arguments);
};

var real__free = asm["_free"]; asm["_free"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__free.apply(null, arguments);
};

var real_establishStackSpace = asm["establishStackSpace"]; asm["establishStackSpace"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_establishStackSpace.apply(null, arguments);
};

var real__memmove = asm["_memmove"]; asm["_memmove"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__memmove.apply(null, arguments);
};

var real_stackRestore = asm["stackRestore"]; asm["stackRestore"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real_stackRestore.apply(null, arguments);
};

var real__malloc = asm["_malloc"]; asm["_malloc"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__malloc.apply(null, arguments);
};
var stackSave = Module["stackSave"] = asm["stackSave"];
var getTempRet0 = Module["getTempRet0"] = asm["getTempRet0"];
var _memset = Module["_memset"] = asm["_memset"];
var setThrew = Module["setThrew"] = asm["setThrew"];
var _bitshift64Lshr = Module["_bitshift64Lshr"] = asm["_bitshift64Lshr"];
var _bitshift64Shl = Module["_bitshift64Shl"] = asm["_bitshift64Shl"];
var _fflush = Module["_fflush"] = asm["_fflush"];
var ___cxa_is_pointer_type = Module["___cxa_is_pointer_type"] = asm["___cxa_is_pointer_type"];
var _llvm_cttz_i32 = Module["_llvm_cttz_i32"] = asm["_llvm_cttz_i32"];
var _sbrk = Module["_sbrk"] = asm["_sbrk"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var _llvm_bswap_i32 = Module["_llvm_bswap_i32"] = asm["_llvm_bswap_i32"];
var ___uremdi3 = Module["___uremdi3"] = asm["___uremdi3"];
var stackAlloc = Module["stackAlloc"] = asm["stackAlloc"];
var _i64Subtract = Module["_i64Subtract"] = asm["_i64Subtract"];
var __GLOBAL__sub_I_bind_cpp = Module["__GLOBAL__sub_I_bind_cpp"] = asm["__GLOBAL__sub_I_bind_cpp"];
var ___udivmoddi4 = Module["___udivmoddi4"] = asm["___udivmoddi4"];
var setTempRet0 = Module["setTempRet0"] = asm["setTempRet0"];
var _i64Add = Module["_i64Add"] = asm["_i64Add"];
var __GLOBAL__sub_I_chunks_cpp = Module["__GLOBAL__sub_I_chunks_cpp"] = asm["__GLOBAL__sub_I_chunks_cpp"];
var _emscripten_get_global_libc = Module["_emscripten_get_global_libc"] = asm["_emscripten_get_global_libc"];
var ___getTypeName = Module["___getTypeName"] = asm["___getTypeName"];
var ___udivdi3 = Module["___udivdi3"] = asm["___udivdi3"];
var ___errno_location = Module["___errno_location"] = asm["___errno_location"];
var ___cxa_can_catch = Module["___cxa_can_catch"] = asm["___cxa_can_catch"];
var _free = Module["_free"] = asm["_free"];
var runPostSets = Module["runPostSets"] = asm["runPostSets"];
var establishStackSpace = Module["establishStackSpace"] = asm["establishStackSpace"];
var _memmove = Module["_memmove"] = asm["_memmove"];
var stackRestore = Module["stackRestore"] = asm["stackRestore"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var _emscripten_replace_memory = Module["_emscripten_replace_memory"] = asm["_emscripten_replace_memory"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_viiiii = Module["dynCall_viiiii"] = asm["dynCall_viiiii"];
var dynCall_i = Module["dynCall_i"] = asm["dynCall_i"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
var dynCall_vii = Module["dynCall_vii"] = asm["dynCall_vii"];
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
var dynCall_viii = Module["dynCall_viii"] = asm["dynCall_viii"];
var dynCall_v = Module["dynCall_v"] = asm["dynCall_v"];
var dynCall_iiiii = Module["dynCall_iiiii"] = asm["dynCall_iiiii"];
var dynCall_viiiiii = Module["dynCall_viiiiii"] = asm["dynCall_viiiiii"];
var dynCall_iii = Module["dynCall_iii"] = asm["dynCall_iii"];
var dynCall_iiiiii = Module["dynCall_iiiiii"] = asm["dynCall_iiiiii"];
var dynCall_viiii = Module["dynCall_viiii"] = asm["dynCall_viiii"];
;

Runtime.stackAlloc = Module['stackAlloc'];
Runtime.stackSave = Module['stackSave'];
Runtime.stackRestore = Module['stackRestore'];
Runtime.establishStackSpace = Module['establishStackSpace'];

Runtime.setTempRet0 = Module['setTempRet0'];
Runtime.getTempRet0 = Module['getTempRet0'];



// === Auto-generated postamble setup entry stuff ===

Module['asm'] = asm;





function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
};
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;

var initialStackTop;
var preloadStartTime = null;
var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!Module['calledRun']) run();
  if (!Module['calledRun']) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
}

Module['callMain'] = Module.callMain = function callMain(args) {
  assert(runDependencies == 0, 'cannot call main when async dependencies remain! (listen on __ATMAIN__)');
  assert(__ATPRERUN__.length == 0, 'cannot call main when preRun functions remain to be called');

  args = args || [];

  ensureInitRuntime();

  var argc = args.length+1;
  function pad() {
    for (var i = 0; i < 4-1; i++) {
      argv.push(0);
    }
  }
  var argv = [allocate(intArrayFromString(Module['thisProgram']), 'i8', ALLOC_NORMAL) ];
  pad();
  for (var i = 0; i < argc-1; i = i + 1) {
    argv.push(allocate(intArrayFromString(args[i]), 'i8', ALLOC_NORMAL));
    pad();
  }
  argv.push(0);
  argv = allocate(argv, 'i32', ALLOC_NORMAL);


  try {

    var ret = Module['_main'](argc, argv, 0);


    // if we're not running an evented main loop, it's time to exit
    exit(ret, /* implicit = */ true);
  }
  catch(e) {
    if (e instanceof ExitStatus) {
      // exit() throws this once it's done to make sure execution
      // has been stopped completely
      return;
    } else if (e == 'SimulateInfiniteLoop') {
      // running an evented main loop, don't immediately exit
      Module['noExitRuntime'] = true;
      return;
    } else {
      var toLog = e;
      if (e && typeof e === 'object' && e.stack) {
        toLog = [e, e.stack];
      }
      Module.printErr('exception thrown: ' + toLog);
      Module['quit'](1, e);
    }
  } finally {
    calledMain = true;
  }
}




function run(args) {
  args = args || Module['arguments'];

  if (preloadStartTime === null) preloadStartTime = Date.now();

  if (runDependencies > 0) {
    Module.printErr('run() called, but dependencies remain, so not running');
    return;
  }

  writeStackCookie();

  preRun();

  if (runDependencies > 0) return; // a preRun added a dependency, run will be called later
  if (Module['calledRun']) return; // run may have just been called through dependencies being fulfilled just in this very frame

  function doRun() {
    if (Module['calledRun']) return; // run may have just been called while the async setStatus time below was happening
    Module['calledRun'] = true;

    if (ABORT) return;

    ensureInitRuntime();

    preMain();

    if (ENVIRONMENT_IS_WEB && preloadStartTime !== null) {
      Module.printErr('pre-main prep time: ' + (Date.now() - preloadStartTime) + ' ms');
    }

    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();

    if (Module['_main'] && shouldRunNow) Module['callMain'](args);

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
  checkStackCookie();
}
Module['run'] = Module.run = run;

function exit(status, implicit) {
  if (implicit && Module['noExitRuntime']) {
    Module.printErr('exit(' + status + ') implicitly called by end of main(), but noExitRuntime, so not exiting the runtime (you can use emscripten_force_exit, if you want to force a true shutdown)');
    return;
  }

  if (Module['noExitRuntime']) {
    Module.printErr('exit(' + status + ') called, but noExitRuntime, so halting execution but not exiting the runtime or preventing further async execution (you can use emscripten_force_exit, if you want to force a true shutdown)');
  } else {

    ABORT = true;
    EXITSTATUS = status;
    STACKTOP = initialStackTop;

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);
  }

  if (ENVIRONMENT_IS_NODE) {
    process['exit'](status);
  }
  Module['quit'](status, new ExitStatus(status));
}
Module['exit'] = Module.exit = exit;

var abortDecorators = [];

function abort(what) {
  if (what !== undefined) {
    Module.print(what);
    Module.printErr(what);
    what = JSON.stringify(what)
  } else {
    what = '';
  }

  ABORT = true;
  EXITSTATUS = 1;

  var extra = '';

  var output = 'abort(' + what + ') at ' + stackTrace() + extra;
  if (abortDecorators) {
    abortDecorators.forEach(function(decorator) {
      output = decorator(output, what);
    });
  }
  throw output;
}
Module['abort'] = Module.abort = abort;

// {{PRE_RUN_ADDITIONS}}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}

// shouldRunNow refers to calling main(), not run().
var shouldRunNow = true;
if (Module['noInitialRun']) {
  shouldRunNow = false;
}


run();

// {{POST_RUN_ADDITIONS}}





// {{MODULE_ADDITIONS}}



onmessage = function(msg) {
  var chunk = msg.data;
  var blocks = new Module.VectorBlock();
  for (var i = 0; i < chunk.length; i++) {
    blocks.push_back(chunk[i]);
  }
  var res = Module.chunkify(blocks);
  postMessage(res);
};

