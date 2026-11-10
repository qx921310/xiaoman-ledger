var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/react/cjs/react.production.min.js
var require_react_production_min = __commonJS({
  "node_modules/react/cjs/react.production.min.js"(exports2) {
    "use strict";
    var l = Symbol.for("react.element");
    var n = Symbol.for("react.portal");
    var p = Symbol.for("react.fragment");
    var q = Symbol.for("react.strict_mode");
    var r = Symbol.for("react.profiler");
    var t = Symbol.for("react.provider");
    var u = Symbol.for("react.context");
    var v = Symbol.for("react.forward_ref");
    var w = Symbol.for("react.suspense");
    var x = Symbol.for("react.memo");
    var y = Symbol.for("react.lazy");
    var z = Symbol.iterator;
    function A(a) {
      if (null === a || "object" !== typeof a) return null;
      a = z && a[z] || a["@@iterator"];
      return "function" === typeof a ? a : null;
    }
    var B = { isMounted: function() {
      return false;
    }, enqueueForceUpdate: function() {
    }, enqueueReplaceState: function() {
    }, enqueueSetState: function() {
    } };
    var C = Object.assign;
    var D = {};
    function E(a, b, e) {
      this.props = a;
      this.context = b;
      this.refs = D;
      this.updater = e || B;
    }
    E.prototype.isReactComponent = {};
    E.prototype.setState = function(a, b) {
      if ("object" !== typeof a && "function" !== typeof a && null != a) throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");
      this.updater.enqueueSetState(this, a, b, "setState");
    };
    E.prototype.forceUpdate = function(a) {
      this.updater.enqueueForceUpdate(this, a, "forceUpdate");
    };
    function F() {
    }
    F.prototype = E.prototype;
    function G(a, b, e) {
      this.props = a;
      this.context = b;
      this.refs = D;
      this.updater = e || B;
    }
    var H = G.prototype = new F();
    H.constructor = G;
    C(H, E.prototype);
    H.isPureReactComponent = true;
    var I = Array.isArray;
    var J = Object.prototype.hasOwnProperty;
    var K = { current: null };
    var L = { key: true, ref: true, __self: true, __source: true };
    function M(a, b, e) {
      var d, c = {}, k = null, h = null;
      if (null != b) for (d in void 0 !== b.ref && (h = b.ref), void 0 !== b.key && (k = "" + b.key), b) J.call(b, d) && !L.hasOwnProperty(d) && (c[d] = b[d]);
      var g = arguments.length - 2;
      if (1 === g) c.children = e;
      else if (1 < g) {
        for (var f = Array(g), m = 0; m < g; m++) f[m] = arguments[m + 2];
        c.children = f;
      }
      if (a && a.defaultProps) for (d in g = a.defaultProps, g) void 0 === c[d] && (c[d] = g[d]);
      return { $$typeof: l, type: a, key: k, ref: h, props: c, _owner: K.current };
    }
    function N(a, b) {
      return { $$typeof: l, type: a.type, key: b, ref: a.ref, props: a.props, _owner: a._owner };
    }
    function O(a) {
      return "object" === typeof a && null !== a && a.$$typeof === l;
    }
    function escape(a) {
      var b = { "=": "=0", ":": "=2" };
      return "$" + a.replace(/[=:]/g, function(a2) {
        return b[a2];
      });
    }
    var P = /\/+/g;
    function Q(a, b) {
      return "object" === typeof a && null !== a && null != a.key ? escape("" + a.key) : b.toString(36);
    }
    function R(a, b, e, d, c) {
      var k = typeof a;
      if ("undefined" === k || "boolean" === k) a = null;
      var h = false;
      if (null === a) h = true;
      else switch (k) {
        case "string":
        case "number":
          h = true;
          break;
        case "object":
          switch (a.$$typeof) {
            case l:
            case n:
              h = true;
          }
      }
      if (h) return h = a, c = c(h), a = "" === d ? "." + Q(h, 0) : d, I(c) ? (e = "", null != a && (e = a.replace(P, "$&/") + "/"), R(c, b, e, "", function(a2) {
        return a2;
      })) : null != c && (O(c) && (c = N(c, e + (!c.key || h && h.key === c.key ? "" : ("" + c.key).replace(P, "$&/") + "/") + a)), b.push(c)), 1;
      h = 0;
      d = "" === d ? "." : d + ":";
      if (I(a)) for (var g = 0; g < a.length; g++) {
        k = a[g];
        var f = d + Q(k, g);
        h += R(k, b, e, f, c);
      }
      else if (f = A(a), "function" === typeof f) for (a = f.call(a), g = 0; !(k = a.next()).done; ) k = k.value, f = d + Q(k, g++), h += R(k, b, e, f, c);
      else if ("object" === k) throw b = String(a), Error("Objects are not valid as a React child (found: " + ("[object Object]" === b ? "object with keys {" + Object.keys(a).join(", ") + "}" : b) + "). If you meant to render a collection of children, use an array instead.");
      return h;
    }
    function S(a, b, e) {
      if (null == a) return a;
      var d = [], c = 0;
      R(a, d, "", "", function(a2) {
        return b.call(e, a2, c++);
      });
      return d;
    }
    function T(a) {
      if (-1 === a._status) {
        var b = a._result;
        b = b();
        b.then(function(b2) {
          if (0 === a._status || -1 === a._status) a._status = 1, a._result = b2;
        }, function(b2) {
          if (0 === a._status || -1 === a._status) a._status = 2, a._result = b2;
        });
        -1 === a._status && (a._status = 0, a._result = b);
      }
      if (1 === a._status) return a._result.default;
      throw a._result;
    }
    var U = { current: null };
    var V = { transition: null };
    var W = { ReactCurrentDispatcher: U, ReactCurrentBatchConfig: V, ReactCurrentOwner: K };
    function X() {
      throw Error("act(...) is not supported in production builds of React.");
    }
    exports2.Children = { map: S, forEach: function(a, b, e) {
      S(a, function() {
        b.apply(this, arguments);
      }, e);
    }, count: function(a) {
      var b = 0;
      S(a, function() {
        b++;
      });
      return b;
    }, toArray: function(a) {
      return S(a, function(a2) {
        return a2;
      }) || [];
    }, only: function(a) {
      if (!O(a)) throw Error("React.Children.only expected to receive a single React element child.");
      return a;
    } };
    exports2.Component = E;
    exports2.Fragment = p;
    exports2.Profiler = r;
    exports2.PureComponent = G;
    exports2.StrictMode = q;
    exports2.Suspense = w;
    exports2.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = W;
    exports2.act = X;
    exports2.cloneElement = function(a, b, e) {
      if (null === a || void 0 === a) throw Error("React.cloneElement(...): The argument must be a React element, but you passed " + a + ".");
      var d = C({}, a.props), c = a.key, k = a.ref, h = a._owner;
      if (null != b) {
        void 0 !== b.ref && (k = b.ref, h = K.current);
        void 0 !== b.key && (c = "" + b.key);
        if (a.type && a.type.defaultProps) var g = a.type.defaultProps;
        for (f in b) J.call(b, f) && !L.hasOwnProperty(f) && (d[f] = void 0 === b[f] && void 0 !== g ? g[f] : b[f]);
      }
      var f = arguments.length - 2;
      if (1 === f) d.children = e;
      else if (1 < f) {
        g = Array(f);
        for (var m = 0; m < f; m++) g[m] = arguments[m + 2];
        d.children = g;
      }
      return { $$typeof: l, type: a.type, key: c, ref: k, props: d, _owner: h };
    };
    exports2.createContext = function(a) {
      a = { $$typeof: u, _currentValue: a, _currentValue2: a, _threadCount: 0, Provider: null, Consumer: null, _defaultValue: null, _globalName: null };
      a.Provider = { $$typeof: t, _context: a };
      return a.Consumer = a;
    };
    exports2.createElement = M;
    exports2.createFactory = function(a) {
      var b = M.bind(null, a);
      b.type = a;
      return b;
    };
    exports2.createRef = function() {
      return { current: null };
    };
    exports2.forwardRef = function(a) {
      return { $$typeof: v, render: a };
    };
    exports2.isValidElement = O;
    exports2.lazy = function(a) {
      return { $$typeof: y, _payload: { _status: -1, _result: a }, _init: T };
    };
    exports2.memo = function(a, b) {
      return { $$typeof: x, type: a, compare: void 0 === b ? null : b };
    };
    exports2.startTransition = function(a) {
      var b = V.transition;
      V.transition = {};
      try {
        a();
      } finally {
        V.transition = b;
      }
    };
    exports2.unstable_act = X;
    exports2.useCallback = function(a, b) {
      return U.current.useCallback(a, b);
    };
    exports2.useContext = function(a) {
      return U.current.useContext(a);
    };
    exports2.useDebugValue = function() {
    };
    exports2.useDeferredValue = function(a) {
      return U.current.useDeferredValue(a);
    };
    exports2.useEffect = function(a, b) {
      return U.current.useEffect(a, b);
    };
    exports2.useId = function() {
      return U.current.useId();
    };
    exports2.useImperativeHandle = function(a, b, e) {
      return U.current.useImperativeHandle(a, b, e);
    };
    exports2.useInsertionEffect = function(a, b) {
      return U.current.useInsertionEffect(a, b);
    };
    exports2.useLayoutEffect = function(a, b) {
      return U.current.useLayoutEffect(a, b);
    };
    exports2.useMemo = function(a, b) {
      return U.current.useMemo(a, b);
    };
    exports2.useReducer = function(a, b, e) {
      return U.current.useReducer(a, b, e);
    };
    exports2.useRef = function(a) {
      return U.current.useRef(a);
    };
    exports2.useState = function(a) {
      return U.current.useState(a);
    };
    exports2.useSyncExternalStore = function(a, b, e) {
      return U.current.useSyncExternalStore(a, b, e);
    };
    exports2.useTransition = function() {
      return U.current.useTransition();
    };
    exports2.version = "18.3.1";
  }
});

// node_modules/react/cjs/react.development.js
var require_react_development = __commonJS({
  "node_modules/react/cjs/react.development.js"(exports2, module2) {
    "use strict";
    if (process.env.NODE_ENV !== "production") {
      (function() {
        "use strict";
        if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== "undefined" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart === "function") {
          __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(new Error());
        }
        var ReactVersion = "18.3.1";
        var REACT_ELEMENT_TYPE = Symbol.for("react.element");
        var REACT_PORTAL_TYPE = Symbol.for("react.portal");
        var REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
        var REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode");
        var REACT_PROFILER_TYPE = Symbol.for("react.profiler");
        var REACT_PROVIDER_TYPE = Symbol.for("react.provider");
        var REACT_CONTEXT_TYPE = Symbol.for("react.context");
        var REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref");
        var REACT_SUSPENSE_TYPE = Symbol.for("react.suspense");
        var REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list");
        var REACT_MEMO_TYPE = Symbol.for("react.memo");
        var REACT_LAZY_TYPE = Symbol.for("react.lazy");
        var REACT_OFFSCREEN_TYPE = Symbol.for("react.offscreen");
        var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
        var FAUX_ITERATOR_SYMBOL = "@@iterator";
        function getIteratorFn(maybeIterable) {
          if (maybeIterable === null || typeof maybeIterable !== "object") {
            return null;
          }
          var maybeIterator = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable[FAUX_ITERATOR_SYMBOL];
          if (typeof maybeIterator === "function") {
            return maybeIterator;
          }
          return null;
        }
        var ReactCurrentDispatcher = {
          /**
           * @internal
           * @type {ReactComponent}
           */
          current: null
        };
        var ReactCurrentBatchConfig = {
          transition: null
        };
        var ReactCurrentActQueue = {
          current: null,
          // Used to reproduce behavior of `batchedUpdates` in legacy mode.
          isBatchingLegacy: false,
          didScheduleLegacyUpdate: false
        };
        var ReactCurrentOwner = {
          /**
           * @internal
           * @type {ReactComponent}
           */
          current: null
        };
        var ReactDebugCurrentFrame = {};
        var currentExtraStackFrame = null;
        function setExtraStackFrame(stack) {
          {
            currentExtraStackFrame = stack;
          }
        }
        {
          ReactDebugCurrentFrame.setExtraStackFrame = function(stack) {
            {
              currentExtraStackFrame = stack;
            }
          };
          ReactDebugCurrentFrame.getCurrentStack = null;
          ReactDebugCurrentFrame.getStackAddendum = function() {
            var stack = "";
            if (currentExtraStackFrame) {
              stack += currentExtraStackFrame;
            }
            var impl = ReactDebugCurrentFrame.getCurrentStack;
            if (impl) {
              stack += impl() || "";
            }
            return stack;
          };
        }
        var enableScopeAPI = false;
        var enableCacheElement = false;
        var enableTransitionTracing = false;
        var enableLegacyHidden = false;
        var enableDebugTracing = false;
        var ReactSharedInternals = {
          ReactCurrentDispatcher,
          ReactCurrentBatchConfig,
          ReactCurrentOwner
        };
        {
          ReactSharedInternals.ReactDebugCurrentFrame = ReactDebugCurrentFrame;
          ReactSharedInternals.ReactCurrentActQueue = ReactCurrentActQueue;
        }
        function warn(format) {
          {
            {
              for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
                args[_key - 1] = arguments[_key];
              }
              printWarning("warn", format, args);
            }
          }
        }
        function error(format) {
          {
            {
              for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
                args[_key2 - 1] = arguments[_key2];
              }
              printWarning("error", format, args);
            }
          }
        }
        function printWarning(level, format, args) {
          {
            var ReactDebugCurrentFrame2 = ReactSharedInternals.ReactDebugCurrentFrame;
            var stack = ReactDebugCurrentFrame2.getStackAddendum();
            if (stack !== "") {
              format += "%s";
              args = args.concat([stack]);
            }
            var argsWithFormat = args.map(function(item) {
              return String(item);
            });
            argsWithFormat.unshift("Warning: " + format);
            Function.prototype.apply.call(console[level], console, argsWithFormat);
          }
        }
        var didWarnStateUpdateForUnmountedComponent = {};
        function warnNoop(publicInstance, callerName) {
          {
            var _constructor = publicInstance.constructor;
            var componentName = _constructor && (_constructor.displayName || _constructor.name) || "ReactClass";
            var warningKey = componentName + "." + callerName;
            if (didWarnStateUpdateForUnmountedComponent[warningKey]) {
              return;
            }
            error("Can't call %s on a component that is not yet mounted. This is a no-op, but it might indicate a bug in your application. Instead, assign to `this.state` directly or define a `state = {};` class property with the desired state in the %s component.", callerName, componentName);
            didWarnStateUpdateForUnmountedComponent[warningKey] = true;
          }
        }
        var ReactNoopUpdateQueue = {
          /**
           * Checks whether or not this composite component is mounted.
           * @param {ReactClass} publicInstance The instance we want to test.
           * @return {boolean} True if mounted, false otherwise.
           * @protected
           * @final
           */
          isMounted: function(publicInstance) {
            return false;
          },
          /**
           * Forces an update. This should only be invoked when it is known with
           * certainty that we are **not** in a DOM transaction.
           *
           * You may want to call this when you know that some deeper aspect of the
           * component's state has changed but `setState` was not called.
           *
           * This will not invoke `shouldComponentUpdate`, but it will invoke
           * `componentWillUpdate` and `componentDidUpdate`.
           *
           * @param {ReactClass} publicInstance The instance that should rerender.
           * @param {?function} callback Called after component is updated.
           * @param {?string} callerName name of the calling function in the public API.
           * @internal
           */
          enqueueForceUpdate: function(publicInstance, callback, callerName) {
            warnNoop(publicInstance, "forceUpdate");
          },
          /**
           * Replaces all of the state. Always use this or `setState` to mutate state.
           * You should treat `this.state` as immutable.
           *
           * There is no guarantee that `this.state` will be immediately updated, so
           * accessing `this.state` after calling this method may return the old value.
           *
           * @param {ReactClass} publicInstance The instance that should rerender.
           * @param {object} completeState Next state.
           * @param {?function} callback Called after component is updated.
           * @param {?string} callerName name of the calling function in the public API.
           * @internal
           */
          enqueueReplaceState: function(publicInstance, completeState, callback, callerName) {
            warnNoop(publicInstance, "replaceState");
          },
          /**
           * Sets a subset of the state. This only exists because _pendingState is
           * internal. This provides a merging strategy that is not available to deep
           * properties which is confusing. TODO: Expose pendingState or don't use it
           * during the merge.
           *
           * @param {ReactClass} publicInstance The instance that should rerender.
           * @param {object} partialState Next partial state to be merged with state.
           * @param {?function} callback Called after component is updated.
           * @param {?string} Name of the calling function in the public API.
           * @internal
           */
          enqueueSetState: function(publicInstance, partialState, callback, callerName) {
            warnNoop(publicInstance, "setState");
          }
        };
        var assign = Object.assign;
        var emptyObject = {};
        {
          Object.freeze(emptyObject);
        }
        function Component(props, context, updater) {
          this.props = props;
          this.context = context;
          this.refs = emptyObject;
          this.updater = updater || ReactNoopUpdateQueue;
        }
        Component.prototype.isReactComponent = {};
        Component.prototype.setState = function(partialState, callback) {
          if (typeof partialState !== "object" && typeof partialState !== "function" && partialState != null) {
            throw new Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");
          }
          this.updater.enqueueSetState(this, partialState, callback, "setState");
        };
        Component.prototype.forceUpdate = function(callback) {
          this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
        };
        {
          var deprecatedAPIs = {
            isMounted: ["isMounted", "Instead, make sure to clean up subscriptions and pending requests in componentWillUnmount to prevent memory leaks."],
            replaceState: ["replaceState", "Refactor your code to use setState instead (see https://github.com/facebook/react/issues/3236)."]
          };
          var defineDeprecationWarning = function(methodName, info) {
            Object.defineProperty(Component.prototype, methodName, {
              get: function() {
                warn("%s(...) is deprecated in plain JavaScript React classes. %s", info[0], info[1]);
                return void 0;
              }
            });
          };
          for (var fnName in deprecatedAPIs) {
            if (deprecatedAPIs.hasOwnProperty(fnName)) {
              defineDeprecationWarning(fnName, deprecatedAPIs[fnName]);
            }
          }
        }
        function ComponentDummy() {
        }
        ComponentDummy.prototype = Component.prototype;
        function PureComponent(props, context, updater) {
          this.props = props;
          this.context = context;
          this.refs = emptyObject;
          this.updater = updater || ReactNoopUpdateQueue;
        }
        var pureComponentPrototype = PureComponent.prototype = new ComponentDummy();
        pureComponentPrototype.constructor = PureComponent;
        assign(pureComponentPrototype, Component.prototype);
        pureComponentPrototype.isPureReactComponent = true;
        function createRef() {
          var refObject = {
            current: null
          };
          {
            Object.seal(refObject);
          }
          return refObject;
        }
        var isArrayImpl = Array.isArray;
        function isArray(a) {
          return isArrayImpl(a);
        }
        function typeName(value) {
          {
            var hasToStringTag = typeof Symbol === "function" && Symbol.toStringTag;
            var type = hasToStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
            return type;
          }
        }
        function willCoercionThrow(value) {
          {
            try {
              testStringCoercion(value);
              return false;
            } catch (e) {
              return true;
            }
          }
        }
        function testStringCoercion(value) {
          return "" + value;
        }
        function checkKeyStringCoercion(value) {
          {
            if (willCoercionThrow(value)) {
              error("The provided key is an unsupported type %s. This value must be coerced to a string before before using it here.", typeName(value));
              return testStringCoercion(value);
            }
          }
        }
        function getWrappedName(outerType, innerType, wrapperName) {
          var displayName = outerType.displayName;
          if (displayName) {
            return displayName;
          }
          var functionName = innerType.displayName || innerType.name || "";
          return functionName !== "" ? wrapperName + "(" + functionName + ")" : wrapperName;
        }
        function getContextName(type) {
          return type.displayName || "Context";
        }
        function getComponentNameFromType(type) {
          if (type == null) {
            return null;
          }
          {
            if (typeof type.tag === "number") {
              error("Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue.");
            }
          }
          if (typeof type === "function") {
            return type.displayName || type.name || null;
          }
          if (typeof type === "string") {
            return type;
          }
          switch (type) {
            case REACT_FRAGMENT_TYPE:
              return "Fragment";
            case REACT_PORTAL_TYPE:
              return "Portal";
            case REACT_PROFILER_TYPE:
              return "Profiler";
            case REACT_STRICT_MODE_TYPE:
              return "StrictMode";
            case REACT_SUSPENSE_TYPE:
              return "Suspense";
            case REACT_SUSPENSE_LIST_TYPE:
              return "SuspenseList";
          }
          if (typeof type === "object") {
            switch (type.$$typeof) {
              case REACT_CONTEXT_TYPE:
                var context = type;
                return getContextName(context) + ".Consumer";
              case REACT_PROVIDER_TYPE:
                var provider = type;
                return getContextName(provider._context) + ".Provider";
              case REACT_FORWARD_REF_TYPE:
                return getWrappedName(type, type.render, "ForwardRef");
              case REACT_MEMO_TYPE:
                var outerName = type.displayName || null;
                if (outerName !== null) {
                  return outerName;
                }
                return getComponentNameFromType(type.type) || "Memo";
              case REACT_LAZY_TYPE: {
                var lazyComponent = type;
                var payload = lazyComponent._payload;
                var init = lazyComponent._init;
                try {
                  return getComponentNameFromType(init(payload));
                } catch (x) {
                  return null;
                }
              }
            }
          }
          return null;
        }
        var hasOwnProperty = Object.prototype.hasOwnProperty;
        var RESERVED_PROPS = {
          key: true,
          ref: true,
          __self: true,
          __source: true
        };
        var specialPropKeyWarningShown, specialPropRefWarningShown, didWarnAboutStringRefs;
        {
          didWarnAboutStringRefs = {};
        }
        function hasValidRef(config) {
          {
            if (hasOwnProperty.call(config, "ref")) {
              var getter = Object.getOwnPropertyDescriptor(config, "ref").get;
              if (getter && getter.isReactWarning) {
                return false;
              }
            }
          }
          return config.ref !== void 0;
        }
        function hasValidKey(config) {
          {
            if (hasOwnProperty.call(config, "key")) {
              var getter = Object.getOwnPropertyDescriptor(config, "key").get;
              if (getter && getter.isReactWarning) {
                return false;
              }
            }
          }
          return config.key !== void 0;
        }
        function defineKeyPropWarningGetter(props, displayName) {
          var warnAboutAccessingKey = function() {
            {
              if (!specialPropKeyWarningShown) {
                specialPropKeyWarningShown = true;
                error("%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://reactjs.org/link/special-props)", displayName);
              }
            }
          };
          warnAboutAccessingKey.isReactWarning = true;
          Object.defineProperty(props, "key", {
            get: warnAboutAccessingKey,
            configurable: true
          });
        }
        function defineRefPropWarningGetter(props, displayName) {
          var warnAboutAccessingRef = function() {
            {
              if (!specialPropRefWarningShown) {
                specialPropRefWarningShown = true;
                error("%s: `ref` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://reactjs.org/link/special-props)", displayName);
              }
            }
          };
          warnAboutAccessingRef.isReactWarning = true;
          Object.defineProperty(props, "ref", {
            get: warnAboutAccessingRef,
            configurable: true
          });
        }
        function warnIfStringRefCannotBeAutoConverted(config) {
          {
            if (typeof config.ref === "string" && ReactCurrentOwner.current && config.__self && ReactCurrentOwner.current.stateNode !== config.__self) {
              var componentName = getComponentNameFromType(ReactCurrentOwner.current.type);
              if (!didWarnAboutStringRefs[componentName]) {
                error('Component "%s" contains the string ref "%s". Support for string refs will be removed in a future major release. This case cannot be automatically converted to an arrow function. We ask you to manually fix this case by using useRef() or createRef() instead. Learn more about using refs safely here: https://reactjs.org/link/strict-mode-string-ref', componentName, config.ref);
                didWarnAboutStringRefs[componentName] = true;
              }
            }
          }
        }
        var ReactElement = function(type, key, ref, self, source, owner, props) {
          var element = {
            // This tag allows us to uniquely identify this as a React Element
            $$typeof: REACT_ELEMENT_TYPE,
            // Built-in properties that belong on the element
            type,
            key,
            ref,
            props,
            // Record the component responsible for creating this element.
            _owner: owner
          };
          {
            element._store = {};
            Object.defineProperty(element._store, "validated", {
              configurable: false,
              enumerable: false,
              writable: true,
              value: false
            });
            Object.defineProperty(element, "_self", {
              configurable: false,
              enumerable: false,
              writable: false,
              value: self
            });
            Object.defineProperty(element, "_source", {
              configurable: false,
              enumerable: false,
              writable: false,
              value: source
            });
            if (Object.freeze) {
              Object.freeze(element.props);
              Object.freeze(element);
            }
          }
          return element;
        };
        function createElement(type, config, children) {
          var propName;
          var props = {};
          var key = null;
          var ref = null;
          var self = null;
          var source = null;
          if (config != null) {
            if (hasValidRef(config)) {
              ref = config.ref;
              {
                warnIfStringRefCannotBeAutoConverted(config);
              }
            }
            if (hasValidKey(config)) {
              {
                checkKeyStringCoercion(config.key);
              }
              key = "" + config.key;
            }
            self = config.__self === void 0 ? null : config.__self;
            source = config.__source === void 0 ? null : config.__source;
            for (propName in config) {
              if (hasOwnProperty.call(config, propName) && !RESERVED_PROPS.hasOwnProperty(propName)) {
                props[propName] = config[propName];
              }
            }
          }
          var childrenLength = arguments.length - 2;
          if (childrenLength === 1) {
            props.children = children;
          } else if (childrenLength > 1) {
            var childArray = Array(childrenLength);
            for (var i = 0; i < childrenLength; i++) {
              childArray[i] = arguments[i + 2];
            }
            {
              if (Object.freeze) {
                Object.freeze(childArray);
              }
            }
            props.children = childArray;
          }
          if (type && type.defaultProps) {
            var defaultProps = type.defaultProps;
            for (propName in defaultProps) {
              if (props[propName] === void 0) {
                props[propName] = defaultProps[propName];
              }
            }
          }
          {
            if (key || ref) {
              var displayName = typeof type === "function" ? type.displayName || type.name || "Unknown" : type;
              if (key) {
                defineKeyPropWarningGetter(props, displayName);
              }
              if (ref) {
                defineRefPropWarningGetter(props, displayName);
              }
            }
          }
          return ReactElement(type, key, ref, self, source, ReactCurrentOwner.current, props);
        }
        function cloneAndReplaceKey(oldElement, newKey) {
          var newElement = ReactElement(oldElement.type, newKey, oldElement.ref, oldElement._self, oldElement._source, oldElement._owner, oldElement.props);
          return newElement;
        }
        function cloneElement(element, config, children) {
          if (element === null || element === void 0) {
            throw new Error("React.cloneElement(...): The argument must be a React element, but you passed " + element + ".");
          }
          var propName;
          var props = assign({}, element.props);
          var key = element.key;
          var ref = element.ref;
          var self = element._self;
          var source = element._source;
          var owner = element._owner;
          if (config != null) {
            if (hasValidRef(config)) {
              ref = config.ref;
              owner = ReactCurrentOwner.current;
            }
            if (hasValidKey(config)) {
              {
                checkKeyStringCoercion(config.key);
              }
              key = "" + config.key;
            }
            var defaultProps;
            if (element.type && element.type.defaultProps) {
              defaultProps = element.type.defaultProps;
            }
            for (propName in config) {
              if (hasOwnProperty.call(config, propName) && !RESERVED_PROPS.hasOwnProperty(propName)) {
                if (config[propName] === void 0 && defaultProps !== void 0) {
                  props[propName] = defaultProps[propName];
                } else {
                  props[propName] = config[propName];
                }
              }
            }
          }
          var childrenLength = arguments.length - 2;
          if (childrenLength === 1) {
            props.children = children;
          } else if (childrenLength > 1) {
            var childArray = Array(childrenLength);
            for (var i = 0; i < childrenLength; i++) {
              childArray[i] = arguments[i + 2];
            }
            props.children = childArray;
          }
          return ReactElement(element.type, key, ref, self, source, owner, props);
        }
        function isValidElement(object) {
          return typeof object === "object" && object !== null && object.$$typeof === REACT_ELEMENT_TYPE;
        }
        var SEPARATOR = ".";
        var SUBSEPARATOR = ":";
        function escape(key) {
          var escapeRegex = /[=:]/g;
          var escaperLookup = {
            "=": "=0",
            ":": "=2"
          };
          var escapedString = key.replace(escapeRegex, function(match) {
            return escaperLookup[match];
          });
          return "$" + escapedString;
        }
        var didWarnAboutMaps = false;
        var userProvidedKeyEscapeRegex = /\/+/g;
        function escapeUserProvidedKey(text) {
          return text.replace(userProvidedKeyEscapeRegex, "$&/");
        }
        function getElementKey(element, index) {
          if (typeof element === "object" && element !== null && element.key != null) {
            {
              checkKeyStringCoercion(element.key);
            }
            return escape("" + element.key);
          }
          return index.toString(36);
        }
        function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
          var type = typeof children;
          if (type === "undefined" || type === "boolean") {
            children = null;
          }
          var invokeCallback = false;
          if (children === null) {
            invokeCallback = true;
          } else {
            switch (type) {
              case "string":
              case "number":
                invokeCallback = true;
                break;
              case "object":
                switch (children.$$typeof) {
                  case REACT_ELEMENT_TYPE:
                  case REACT_PORTAL_TYPE:
                    invokeCallback = true;
                }
            }
          }
          if (invokeCallback) {
            var _child = children;
            var mappedChild = callback(_child);
            var childKey = nameSoFar === "" ? SEPARATOR + getElementKey(_child, 0) : nameSoFar;
            if (isArray(mappedChild)) {
              var escapedChildKey = "";
              if (childKey != null) {
                escapedChildKey = escapeUserProvidedKey(childKey) + "/";
              }
              mapIntoArray(mappedChild, array, escapedChildKey, "", function(c) {
                return c;
              });
            } else if (mappedChild != null) {
              if (isValidElement(mappedChild)) {
                {
                  if (mappedChild.key && (!_child || _child.key !== mappedChild.key)) {
                    checkKeyStringCoercion(mappedChild.key);
                  }
                }
                mappedChild = cloneAndReplaceKey(
                  mappedChild,
                  // Keep both the (mapped) and old keys if they differ, just as
                  // traverseAllChildren used to do for objects as children
                  escapedPrefix + // $FlowFixMe Flow incorrectly thinks React.Portal doesn't have a key
                  (mappedChild.key && (!_child || _child.key !== mappedChild.key) ? (
                    // $FlowFixMe Flow incorrectly thinks existing element's key can be a number
                    // eslint-disable-next-line react-internal/safe-string-coercion
                    escapeUserProvidedKey("" + mappedChild.key) + "/"
                  ) : "") + childKey
                );
              }
              array.push(mappedChild);
            }
            return 1;
          }
          var child;
          var nextName;
          var subtreeCount = 0;
          var nextNamePrefix = nameSoFar === "" ? SEPARATOR : nameSoFar + SUBSEPARATOR;
          if (isArray(children)) {
            for (var i = 0; i < children.length; i++) {
              child = children[i];
              nextName = nextNamePrefix + getElementKey(child, i);
              subtreeCount += mapIntoArray(child, array, escapedPrefix, nextName, callback);
            }
          } else {
            var iteratorFn = getIteratorFn(children);
            if (typeof iteratorFn === "function") {
              var iterableChildren = children;
              {
                if (iteratorFn === iterableChildren.entries) {
                  if (!didWarnAboutMaps) {
                    warn("Using Maps as children is not supported. Use an array of keyed ReactElements instead.");
                  }
                  didWarnAboutMaps = true;
                }
              }
              var iterator = iteratorFn.call(iterableChildren);
              var step;
              var ii = 0;
              while (!(step = iterator.next()).done) {
                child = step.value;
                nextName = nextNamePrefix + getElementKey(child, ii++);
                subtreeCount += mapIntoArray(child, array, escapedPrefix, nextName, callback);
              }
            } else if (type === "object") {
              var childrenString = String(children);
              throw new Error("Objects are not valid as a React child (found: " + (childrenString === "[object Object]" ? "object with keys {" + Object.keys(children).join(", ") + "}" : childrenString) + "). If you meant to render a collection of children, use an array instead.");
            }
          }
          return subtreeCount;
        }
        function mapChildren(children, func, context) {
          if (children == null) {
            return children;
          }
          var result = [];
          var count = 0;
          mapIntoArray(children, result, "", "", function(child) {
            return func.call(context, child, count++);
          });
          return result;
        }
        function countChildren(children) {
          var n = 0;
          mapChildren(children, function() {
            n++;
          });
          return n;
        }
        function forEachChildren(children, forEachFunc, forEachContext) {
          mapChildren(children, function() {
            forEachFunc.apply(this, arguments);
          }, forEachContext);
        }
        function toArray(children) {
          return mapChildren(children, function(child) {
            return child;
          }) || [];
        }
        function onlyChild(children) {
          if (!isValidElement(children)) {
            throw new Error("React.Children.only expected to receive a single React element child.");
          }
          return children;
        }
        function createContext(defaultValue) {
          var context = {
            $$typeof: REACT_CONTEXT_TYPE,
            // As a workaround to support multiple concurrent renderers, we categorize
            // some renderers as primary and others as secondary. We only expect
            // there to be two concurrent renderers at most: React Native (primary) and
            // Fabric (secondary); React DOM (primary) and React ART (secondary).
            // Secondary renderers store their context values on separate fields.
            _currentValue: defaultValue,
            _currentValue2: defaultValue,
            // Used to track how many concurrent renderers this context currently
            // supports within in a single renderer. Such as parallel server rendering.
            _threadCount: 0,
            // These are circular
            Provider: null,
            Consumer: null,
            // Add these to use same hidden class in VM as ServerContext
            _defaultValue: null,
            _globalName: null
          };
          context.Provider = {
            $$typeof: REACT_PROVIDER_TYPE,
            _context: context
          };
          var hasWarnedAboutUsingNestedContextConsumers = false;
          var hasWarnedAboutUsingConsumerProvider = false;
          var hasWarnedAboutDisplayNameOnConsumer = false;
          {
            var Consumer = {
              $$typeof: REACT_CONTEXT_TYPE,
              _context: context
            };
            Object.defineProperties(Consumer, {
              Provider: {
                get: function() {
                  if (!hasWarnedAboutUsingConsumerProvider) {
                    hasWarnedAboutUsingConsumerProvider = true;
                    error("Rendering <Context.Consumer.Provider> is not supported and will be removed in a future major release. Did you mean to render <Context.Provider> instead?");
                  }
                  return context.Provider;
                },
                set: function(_Provider) {
                  context.Provider = _Provider;
                }
              },
              _currentValue: {
                get: function() {
                  return context._currentValue;
                },
                set: function(_currentValue) {
                  context._currentValue = _currentValue;
                }
              },
              _currentValue2: {
                get: function() {
                  return context._currentValue2;
                },
                set: function(_currentValue2) {
                  context._currentValue2 = _currentValue2;
                }
              },
              _threadCount: {
                get: function() {
                  return context._threadCount;
                },
                set: function(_threadCount) {
                  context._threadCount = _threadCount;
                }
              },
              Consumer: {
                get: function() {
                  if (!hasWarnedAboutUsingNestedContextConsumers) {
                    hasWarnedAboutUsingNestedContextConsumers = true;
                    error("Rendering <Context.Consumer.Consumer> is not supported and will be removed in a future major release. Did you mean to render <Context.Consumer> instead?");
                  }
                  return context.Consumer;
                }
              },
              displayName: {
                get: function() {
                  return context.displayName;
                },
                set: function(displayName) {
                  if (!hasWarnedAboutDisplayNameOnConsumer) {
                    warn("Setting `displayName` on Context.Consumer has no effect. You should set it directly on the context with Context.displayName = '%s'.", displayName);
                    hasWarnedAboutDisplayNameOnConsumer = true;
                  }
                }
              }
            });
            context.Consumer = Consumer;
          }
          {
            context._currentRenderer = null;
            context._currentRenderer2 = null;
          }
          return context;
        }
        var Uninitialized = -1;
        var Pending = 0;
        var Resolved = 1;
        var Rejected = 2;
        function lazyInitializer(payload) {
          if (payload._status === Uninitialized) {
            var ctor = payload._result;
            var thenable = ctor();
            thenable.then(function(moduleObject2) {
              if (payload._status === Pending || payload._status === Uninitialized) {
                var resolved = payload;
                resolved._status = Resolved;
                resolved._result = moduleObject2;
              }
            }, function(error2) {
              if (payload._status === Pending || payload._status === Uninitialized) {
                var rejected = payload;
                rejected._status = Rejected;
                rejected._result = error2;
              }
            });
            if (payload._status === Uninitialized) {
              var pending = payload;
              pending._status = Pending;
              pending._result = thenable;
            }
          }
          if (payload._status === Resolved) {
            var moduleObject = payload._result;
            {
              if (moduleObject === void 0) {
                error("lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))\n\nDid you accidentally put curly braces around the import?", moduleObject);
              }
            }
            {
              if (!("default" in moduleObject)) {
                error("lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))", moduleObject);
              }
            }
            return moduleObject.default;
          } else {
            throw payload._result;
          }
        }
        function lazy(ctor) {
          var payload = {
            // We use these fields to store the result.
            _status: Uninitialized,
            _result: ctor
          };
          var lazyType = {
            $$typeof: REACT_LAZY_TYPE,
            _payload: payload,
            _init: lazyInitializer
          };
          {
            var defaultProps;
            var propTypes;
            Object.defineProperties(lazyType, {
              defaultProps: {
                configurable: true,
                get: function() {
                  return defaultProps;
                },
                set: function(newDefaultProps) {
                  error("React.lazy(...): It is not supported to assign `defaultProps` to a lazy component import. Either specify them where the component is defined, or create a wrapping component around it.");
                  defaultProps = newDefaultProps;
                  Object.defineProperty(lazyType, "defaultProps", {
                    enumerable: true
                  });
                }
              },
              propTypes: {
                configurable: true,
                get: function() {
                  return propTypes;
                },
                set: function(newPropTypes) {
                  error("React.lazy(...): It is not supported to assign `propTypes` to a lazy component import. Either specify them where the component is defined, or create a wrapping component around it.");
                  propTypes = newPropTypes;
                  Object.defineProperty(lazyType, "propTypes", {
                    enumerable: true
                  });
                }
              }
            });
          }
          return lazyType;
        }
        function forwardRef(render) {
          {
            if (render != null && render.$$typeof === REACT_MEMO_TYPE) {
              error("forwardRef requires a render function but received a `memo` component. Instead of forwardRef(memo(...)), use memo(forwardRef(...)).");
            } else if (typeof render !== "function") {
              error("forwardRef requires a render function but was given %s.", render === null ? "null" : typeof render);
            } else {
              if (render.length !== 0 && render.length !== 2) {
                error("forwardRef render functions accept exactly two parameters: props and ref. %s", render.length === 1 ? "Did you forget to use the ref parameter?" : "Any additional parameter will be undefined.");
              }
            }
            if (render != null) {
              if (render.defaultProps != null || render.propTypes != null) {
                error("forwardRef render functions do not support propTypes or defaultProps. Did you accidentally pass a React component?");
              }
            }
          }
          var elementType = {
            $$typeof: REACT_FORWARD_REF_TYPE,
            render
          };
          {
            var ownName;
            Object.defineProperty(elementType, "displayName", {
              enumerable: false,
              configurable: true,
              get: function() {
                return ownName;
              },
              set: function(name) {
                ownName = name;
                if (!render.name && !render.displayName) {
                  render.displayName = name;
                }
              }
            });
          }
          return elementType;
        }
        var REACT_MODULE_REFERENCE;
        {
          REACT_MODULE_REFERENCE = Symbol.for("react.module.reference");
        }
        function isValidElementType(type) {
          if (typeof type === "string" || typeof type === "function") {
            return true;
          }
          if (type === REACT_FRAGMENT_TYPE || type === REACT_PROFILER_TYPE || enableDebugTracing || type === REACT_STRICT_MODE_TYPE || type === REACT_SUSPENSE_TYPE || type === REACT_SUSPENSE_LIST_TYPE || enableLegacyHidden || type === REACT_OFFSCREEN_TYPE || enableScopeAPI || enableCacheElement || enableTransitionTracing) {
            return true;
          }
          if (typeof type === "object" && type !== null) {
            if (type.$$typeof === REACT_LAZY_TYPE || type.$$typeof === REACT_MEMO_TYPE || type.$$typeof === REACT_PROVIDER_TYPE || type.$$typeof === REACT_CONTEXT_TYPE || type.$$typeof === REACT_FORWARD_REF_TYPE || // This needs to include all possible module reference object
            // types supported by any Flight configuration anywhere since
            // we don't know which Flight build this will end up being used
            // with.
            type.$$typeof === REACT_MODULE_REFERENCE || type.getModuleId !== void 0) {
              return true;
            }
          }
          return false;
        }
        function memo(type, compare) {
          {
            if (!isValidElementType(type)) {
              error("memo: The first argument must be a component. Instead received: %s", type === null ? "null" : typeof type);
            }
          }
          var elementType = {
            $$typeof: REACT_MEMO_TYPE,
            type,
            compare: compare === void 0 ? null : compare
          };
          {
            var ownName;
            Object.defineProperty(elementType, "displayName", {
              enumerable: false,
              configurable: true,
              get: function() {
                return ownName;
              },
              set: function(name) {
                ownName = name;
                if (!type.name && !type.displayName) {
                  type.displayName = name;
                }
              }
            });
          }
          return elementType;
        }
        function resolveDispatcher() {
          var dispatcher = ReactCurrentDispatcher.current;
          {
            if (dispatcher === null) {
              error("Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:\n1. You might have mismatching versions of React and the renderer (such as React DOM)\n2. You might be breaking the Rules of Hooks\n3. You might have more than one copy of React in the same app\nSee https://reactjs.org/link/invalid-hook-call for tips about how to debug and fix this problem.");
            }
          }
          return dispatcher;
        }
        function useContext(Context) {
          var dispatcher = resolveDispatcher();
          {
            if (Context._context !== void 0) {
              var realContext = Context._context;
              if (realContext.Consumer === Context) {
                error("Calling useContext(Context.Consumer) is not supported, may cause bugs, and will be removed in a future major release. Did you mean to call useContext(Context) instead?");
              } else if (realContext.Provider === Context) {
                error("Calling useContext(Context.Provider) is not supported. Did you mean to call useContext(Context) instead?");
              }
            }
          }
          return dispatcher.useContext(Context);
        }
        function useState(initialState) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useState(initialState);
        }
        function useReducer(reducer, initialArg, init) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useReducer(reducer, initialArg, init);
        }
        function useRef(initialValue) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useRef(initialValue);
        }
        function useEffect(create2, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useEffect(create2, deps);
        }
        function useInsertionEffect(create2, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useInsertionEffect(create2, deps);
        }
        function useLayoutEffect(create2, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useLayoutEffect(create2, deps);
        }
        function useCallback(callback, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useCallback(callback, deps);
        }
        function useMemo(create2, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useMemo(create2, deps);
        }
        function useImperativeHandle(ref, create2, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useImperativeHandle(ref, create2, deps);
        }
        function useDebugValue2(value, formatterFn) {
          {
            var dispatcher = resolveDispatcher();
            return dispatcher.useDebugValue(value, formatterFn);
          }
        }
        function useTransition() {
          var dispatcher = resolveDispatcher();
          return dispatcher.useTransition();
        }
        function useDeferredValue(value) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useDeferredValue(value);
        }
        function useId() {
          var dispatcher = resolveDispatcher();
          return dispatcher.useId();
        }
        function useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
        }
        var disabledDepth = 0;
        var prevLog;
        var prevInfo;
        var prevWarn;
        var prevError;
        var prevGroup;
        var prevGroupCollapsed;
        var prevGroupEnd;
        function disabledLog() {
        }
        disabledLog.__reactDisabledLog = true;
        function disableLogs() {
          {
            if (disabledDepth === 0) {
              prevLog = console.log;
              prevInfo = console.info;
              prevWarn = console.warn;
              prevError = console.error;
              prevGroup = console.group;
              prevGroupCollapsed = console.groupCollapsed;
              prevGroupEnd = console.groupEnd;
              var props = {
                configurable: true,
                enumerable: true,
                value: disabledLog,
                writable: true
              };
              Object.defineProperties(console, {
                info: props,
                log: props,
                warn: props,
                error: props,
                group: props,
                groupCollapsed: props,
                groupEnd: props
              });
            }
            disabledDepth++;
          }
        }
        function reenableLogs() {
          {
            disabledDepth--;
            if (disabledDepth === 0) {
              var props = {
                configurable: true,
                enumerable: true,
                writable: true
              };
              Object.defineProperties(console, {
                log: assign({}, props, {
                  value: prevLog
                }),
                info: assign({}, props, {
                  value: prevInfo
                }),
                warn: assign({}, props, {
                  value: prevWarn
                }),
                error: assign({}, props, {
                  value: prevError
                }),
                group: assign({}, props, {
                  value: prevGroup
                }),
                groupCollapsed: assign({}, props, {
                  value: prevGroupCollapsed
                }),
                groupEnd: assign({}, props, {
                  value: prevGroupEnd
                })
              });
            }
            if (disabledDepth < 0) {
              error("disabledDepth fell below zero. This is a bug in React. Please file an issue.");
            }
          }
        }
        var ReactCurrentDispatcher$1 = ReactSharedInternals.ReactCurrentDispatcher;
        var prefix;
        function describeBuiltInComponentFrame(name, source, ownerFn) {
          {
            if (prefix === void 0) {
              try {
                throw Error();
              } catch (x) {
                var match = x.stack.trim().match(/\n( *(at )?)/);
                prefix = match && match[1] || "";
              }
            }
            return "\n" + prefix + name;
          }
        }
        var reentry = false;
        var componentFrameCache;
        {
          var PossiblyWeakMap = typeof WeakMap === "function" ? WeakMap : Map;
          componentFrameCache = new PossiblyWeakMap();
        }
        function describeNativeComponentFrame(fn, construct) {
          if (!fn || reentry) {
            return "";
          }
          {
            var frame = componentFrameCache.get(fn);
            if (frame !== void 0) {
              return frame;
            }
          }
          var control;
          reentry = true;
          var previousPrepareStackTrace = Error.prepareStackTrace;
          Error.prepareStackTrace = void 0;
          var previousDispatcher;
          {
            previousDispatcher = ReactCurrentDispatcher$1.current;
            ReactCurrentDispatcher$1.current = null;
            disableLogs();
          }
          try {
            if (construct) {
              var Fake = function() {
                throw Error();
              };
              Object.defineProperty(Fake.prototype, "props", {
                set: function() {
                  throw Error();
                }
              });
              if (typeof Reflect === "object" && Reflect.construct) {
                try {
                  Reflect.construct(Fake, []);
                } catch (x) {
                  control = x;
                }
                Reflect.construct(fn, [], Fake);
              } else {
                try {
                  Fake.call();
                } catch (x) {
                  control = x;
                }
                fn.call(Fake.prototype);
              }
            } else {
              try {
                throw Error();
              } catch (x) {
                control = x;
              }
              fn();
            }
          } catch (sample) {
            if (sample && control && typeof sample.stack === "string") {
              var sampleLines = sample.stack.split("\n");
              var controlLines = control.stack.split("\n");
              var s = sampleLines.length - 1;
              var c = controlLines.length - 1;
              while (s >= 1 && c >= 0 && sampleLines[s] !== controlLines[c]) {
                c--;
              }
              for (; s >= 1 && c >= 0; s--, c--) {
                if (sampleLines[s] !== controlLines[c]) {
                  if (s !== 1 || c !== 1) {
                    do {
                      s--;
                      c--;
                      if (c < 0 || sampleLines[s] !== controlLines[c]) {
                        var _frame = "\n" + sampleLines[s].replace(" at new ", " at ");
                        if (fn.displayName && _frame.includes("<anonymous>")) {
                          _frame = _frame.replace("<anonymous>", fn.displayName);
                        }
                        {
                          if (typeof fn === "function") {
                            componentFrameCache.set(fn, _frame);
                          }
                        }
                        return _frame;
                      }
                    } while (s >= 1 && c >= 0);
                  }
                  break;
                }
              }
            }
          } finally {
            reentry = false;
            {
              ReactCurrentDispatcher$1.current = previousDispatcher;
              reenableLogs();
            }
            Error.prepareStackTrace = previousPrepareStackTrace;
          }
          var name = fn ? fn.displayName || fn.name : "";
          var syntheticFrame = name ? describeBuiltInComponentFrame(name) : "";
          {
            if (typeof fn === "function") {
              componentFrameCache.set(fn, syntheticFrame);
            }
          }
          return syntheticFrame;
        }
        function describeFunctionComponentFrame(fn, source, ownerFn) {
          {
            return describeNativeComponentFrame(fn, false);
          }
        }
        function shouldConstruct(Component2) {
          var prototype = Component2.prototype;
          return !!(prototype && prototype.isReactComponent);
        }
        function describeUnknownElementTypeFrameInDEV(type, source, ownerFn) {
          if (type == null) {
            return "";
          }
          if (typeof type === "function") {
            {
              return describeNativeComponentFrame(type, shouldConstruct(type));
            }
          }
          if (typeof type === "string") {
            return describeBuiltInComponentFrame(type);
          }
          switch (type) {
            case REACT_SUSPENSE_TYPE:
              return describeBuiltInComponentFrame("Suspense");
            case REACT_SUSPENSE_LIST_TYPE:
              return describeBuiltInComponentFrame("SuspenseList");
          }
          if (typeof type === "object") {
            switch (type.$$typeof) {
              case REACT_FORWARD_REF_TYPE:
                return describeFunctionComponentFrame(type.render);
              case REACT_MEMO_TYPE:
                return describeUnknownElementTypeFrameInDEV(type.type, source, ownerFn);
              case REACT_LAZY_TYPE: {
                var lazyComponent = type;
                var payload = lazyComponent._payload;
                var init = lazyComponent._init;
                try {
                  return describeUnknownElementTypeFrameInDEV(init(payload), source, ownerFn);
                } catch (x) {
                }
              }
            }
          }
          return "";
        }
        var loggedTypeFailures = {};
        var ReactDebugCurrentFrame$1 = ReactSharedInternals.ReactDebugCurrentFrame;
        function setCurrentlyValidatingElement(element) {
          {
            if (element) {
              var owner = element._owner;
              var stack = describeUnknownElementTypeFrameInDEV(element.type, element._source, owner ? owner.type : null);
              ReactDebugCurrentFrame$1.setExtraStackFrame(stack);
            } else {
              ReactDebugCurrentFrame$1.setExtraStackFrame(null);
            }
          }
        }
        function checkPropTypes(typeSpecs, values, location, componentName, element) {
          {
            var has = Function.call.bind(hasOwnProperty);
            for (var typeSpecName in typeSpecs) {
              if (has(typeSpecs, typeSpecName)) {
                var error$1 = void 0;
                try {
                  if (typeof typeSpecs[typeSpecName] !== "function") {
                    var err = Error((componentName || "React class") + ": " + location + " type `" + typeSpecName + "` is invalid; it must be a function, usually from the `prop-types` package, but received `" + typeof typeSpecs[typeSpecName] + "`.This often happens because of typos such as `PropTypes.function` instead of `PropTypes.func`.");
                    err.name = "Invariant Violation";
                    throw err;
                  }
                  error$1 = typeSpecs[typeSpecName](values, typeSpecName, componentName, location, null, "SECRET_DO_NOT_PASS_THIS_OR_YOU_WILL_BE_FIRED");
                } catch (ex) {
                  error$1 = ex;
                }
                if (error$1 && !(error$1 instanceof Error)) {
                  setCurrentlyValidatingElement(element);
                  error("%s: type specification of %s `%s` is invalid; the type checker function must return `null` or an `Error` but returned a %s. You may have forgotten to pass an argument to the type checker creator (arrayOf, instanceOf, objectOf, oneOf, oneOfType, and shape all require an argument).", componentName || "React class", location, typeSpecName, typeof error$1);
                  setCurrentlyValidatingElement(null);
                }
                if (error$1 instanceof Error && !(error$1.message in loggedTypeFailures)) {
                  loggedTypeFailures[error$1.message] = true;
                  setCurrentlyValidatingElement(element);
                  error("Failed %s type: %s", location, error$1.message);
                  setCurrentlyValidatingElement(null);
                }
              }
            }
          }
        }
        function setCurrentlyValidatingElement$1(element) {
          {
            if (element) {
              var owner = element._owner;
              var stack = describeUnknownElementTypeFrameInDEV(element.type, element._source, owner ? owner.type : null);
              setExtraStackFrame(stack);
            } else {
              setExtraStackFrame(null);
            }
          }
        }
        var propTypesMisspellWarningShown;
        {
          propTypesMisspellWarningShown = false;
        }
        function getDeclarationErrorAddendum() {
          if (ReactCurrentOwner.current) {
            var name = getComponentNameFromType(ReactCurrentOwner.current.type);
            if (name) {
              return "\n\nCheck the render method of `" + name + "`.";
            }
          }
          return "";
        }
        function getSourceInfoErrorAddendum(source) {
          if (source !== void 0) {
            var fileName = source.fileName.replace(/^.*[\\\/]/, "");
            var lineNumber = source.lineNumber;
            return "\n\nCheck your code at " + fileName + ":" + lineNumber + ".";
          }
          return "";
        }
        function getSourceInfoErrorAddendumForProps(elementProps) {
          if (elementProps !== null && elementProps !== void 0) {
            return getSourceInfoErrorAddendum(elementProps.__source);
          }
          return "";
        }
        var ownerHasKeyUseWarning = {};
        function getCurrentComponentErrorInfo(parentType) {
          var info = getDeclarationErrorAddendum();
          if (!info) {
            var parentName = typeof parentType === "string" ? parentType : parentType.displayName || parentType.name;
            if (parentName) {
              info = "\n\nCheck the top-level render call using <" + parentName + ">.";
            }
          }
          return info;
        }
        function validateExplicitKey(element, parentType) {
          if (!element._store || element._store.validated || element.key != null) {
            return;
          }
          element._store.validated = true;
          var currentComponentErrorInfo = getCurrentComponentErrorInfo(parentType);
          if (ownerHasKeyUseWarning[currentComponentErrorInfo]) {
            return;
          }
          ownerHasKeyUseWarning[currentComponentErrorInfo] = true;
          var childOwner = "";
          if (element && element._owner && element._owner !== ReactCurrentOwner.current) {
            childOwner = " It was passed a child from " + getComponentNameFromType(element._owner.type) + ".";
          }
          {
            setCurrentlyValidatingElement$1(element);
            error('Each child in a list should have a unique "key" prop.%s%s See https://reactjs.org/link/warning-keys for more information.', currentComponentErrorInfo, childOwner);
            setCurrentlyValidatingElement$1(null);
          }
        }
        function validateChildKeys(node, parentType) {
          if (typeof node !== "object") {
            return;
          }
          if (isArray(node)) {
            for (var i = 0; i < node.length; i++) {
              var child = node[i];
              if (isValidElement(child)) {
                validateExplicitKey(child, parentType);
              }
            }
          } else if (isValidElement(node)) {
            if (node._store) {
              node._store.validated = true;
            }
          } else if (node) {
            var iteratorFn = getIteratorFn(node);
            if (typeof iteratorFn === "function") {
              if (iteratorFn !== node.entries) {
                var iterator = iteratorFn.call(node);
                var step;
                while (!(step = iterator.next()).done) {
                  if (isValidElement(step.value)) {
                    validateExplicitKey(step.value, parentType);
                  }
                }
              }
            }
          }
        }
        function validatePropTypes(element) {
          {
            var type = element.type;
            if (type === null || type === void 0 || typeof type === "string") {
              return;
            }
            var propTypes;
            if (typeof type === "function") {
              propTypes = type.propTypes;
            } else if (typeof type === "object" && (type.$$typeof === REACT_FORWARD_REF_TYPE || // Note: Memo only checks outer props here.
            // Inner props are checked in the reconciler.
            type.$$typeof === REACT_MEMO_TYPE)) {
              propTypes = type.propTypes;
            } else {
              return;
            }
            if (propTypes) {
              var name = getComponentNameFromType(type);
              checkPropTypes(propTypes, element.props, "prop", name, element);
            } else if (type.PropTypes !== void 0 && !propTypesMisspellWarningShown) {
              propTypesMisspellWarningShown = true;
              var _name = getComponentNameFromType(type);
              error("Component %s declared `PropTypes` instead of `propTypes`. Did you misspell the property assignment?", _name || "Unknown");
            }
            if (typeof type.getDefaultProps === "function" && !type.getDefaultProps.isReactClassApproved) {
              error("getDefaultProps is only used on classic React.createClass definitions. Use a static property named `defaultProps` instead.");
            }
          }
        }
        function validateFragmentProps(fragment) {
          {
            var keys = Object.keys(fragment.props);
            for (var i = 0; i < keys.length; i++) {
              var key = keys[i];
              if (key !== "children" && key !== "key") {
                setCurrentlyValidatingElement$1(fragment);
                error("Invalid prop `%s` supplied to `React.Fragment`. React.Fragment can only have `key` and `children` props.", key);
                setCurrentlyValidatingElement$1(null);
                break;
              }
            }
            if (fragment.ref !== null) {
              setCurrentlyValidatingElement$1(fragment);
              error("Invalid attribute `ref` supplied to `React.Fragment`.");
              setCurrentlyValidatingElement$1(null);
            }
          }
        }
        function createElementWithValidation(type, props, children) {
          var validType = isValidElementType(type);
          if (!validType) {
            var info = "";
            if (type === void 0 || typeof type === "object" && type !== null && Object.keys(type).length === 0) {
              info += " You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports.";
            }
            var sourceInfo = getSourceInfoErrorAddendumForProps(props);
            if (sourceInfo) {
              info += sourceInfo;
            } else {
              info += getDeclarationErrorAddendum();
            }
            var typeString;
            if (type === null) {
              typeString = "null";
            } else if (isArray(type)) {
              typeString = "array";
            } else if (type !== void 0 && type.$$typeof === REACT_ELEMENT_TYPE) {
              typeString = "<" + (getComponentNameFromType(type.type) || "Unknown") + " />";
              info = " Did you accidentally export a JSX literal instead of a component?";
            } else {
              typeString = typeof type;
            }
            {
              error("React.createElement: type is invalid -- expected a string (for built-in components) or a class/function (for composite components) but got: %s.%s", typeString, info);
            }
          }
          var element = createElement.apply(this, arguments);
          if (element == null) {
            return element;
          }
          if (validType) {
            for (var i = 2; i < arguments.length; i++) {
              validateChildKeys(arguments[i], type);
            }
          }
          if (type === REACT_FRAGMENT_TYPE) {
            validateFragmentProps(element);
          } else {
            validatePropTypes(element);
          }
          return element;
        }
        var didWarnAboutDeprecatedCreateFactory = false;
        function createFactoryWithValidation(type) {
          var validatedFactory = createElementWithValidation.bind(null, type);
          validatedFactory.type = type;
          {
            if (!didWarnAboutDeprecatedCreateFactory) {
              didWarnAboutDeprecatedCreateFactory = true;
              warn("React.createFactory() is deprecated and will be removed in a future major release. Consider using JSX or use React.createElement() directly instead.");
            }
            Object.defineProperty(validatedFactory, "type", {
              enumerable: false,
              get: function() {
                warn("Factory.type is deprecated. Access the class directly before passing it to createFactory.");
                Object.defineProperty(this, "type", {
                  value: type
                });
                return type;
              }
            });
          }
          return validatedFactory;
        }
        function cloneElementWithValidation(element, props, children) {
          var newElement = cloneElement.apply(this, arguments);
          for (var i = 2; i < arguments.length; i++) {
            validateChildKeys(arguments[i], newElement.type);
          }
          validatePropTypes(newElement);
          return newElement;
        }
        function startTransition(scope, options) {
          var prevTransition = ReactCurrentBatchConfig.transition;
          ReactCurrentBatchConfig.transition = {};
          var currentTransition = ReactCurrentBatchConfig.transition;
          {
            ReactCurrentBatchConfig.transition._updatedFibers = /* @__PURE__ */ new Set();
          }
          try {
            scope();
          } finally {
            ReactCurrentBatchConfig.transition = prevTransition;
            {
              if (prevTransition === null && currentTransition._updatedFibers) {
                var updatedFibersCount = currentTransition._updatedFibers.size;
                if (updatedFibersCount > 10) {
                  warn("Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table.");
                }
                currentTransition._updatedFibers.clear();
              }
            }
          }
        }
        var didWarnAboutMessageChannel = false;
        var enqueueTaskImpl = null;
        function enqueueTask(task) {
          if (enqueueTaskImpl === null) {
            try {
              var requireString = ("require" + Math.random()).slice(0, 7);
              var nodeRequire = module2 && module2[requireString];
              enqueueTaskImpl = nodeRequire.call(module2, "timers").setImmediate;
            } catch (_err) {
              enqueueTaskImpl = function(callback) {
                {
                  if (didWarnAboutMessageChannel === false) {
                    didWarnAboutMessageChannel = true;
                    if (typeof MessageChannel === "undefined") {
                      error("This browser does not have a MessageChannel implementation, so enqueuing tasks via await act(async () => ...) will fail. Please file an issue at https://github.com/facebook/react/issues if you encounter this warning.");
                    }
                  }
                }
                var channel = new MessageChannel();
                channel.port1.onmessage = callback;
                channel.port2.postMessage(void 0);
              };
            }
          }
          return enqueueTaskImpl(task);
        }
        var actScopeDepth = 0;
        var didWarnNoAwaitAct = false;
        function act(callback) {
          {
            var prevActScopeDepth = actScopeDepth;
            actScopeDepth++;
            if (ReactCurrentActQueue.current === null) {
              ReactCurrentActQueue.current = [];
            }
            var prevIsBatchingLegacy = ReactCurrentActQueue.isBatchingLegacy;
            var result;
            try {
              ReactCurrentActQueue.isBatchingLegacy = true;
              result = callback();
              if (!prevIsBatchingLegacy && ReactCurrentActQueue.didScheduleLegacyUpdate) {
                var queue = ReactCurrentActQueue.current;
                if (queue !== null) {
                  ReactCurrentActQueue.didScheduleLegacyUpdate = false;
                  flushActQueue(queue);
                }
              }
            } catch (error2) {
              popActScope(prevActScopeDepth);
              throw error2;
            } finally {
              ReactCurrentActQueue.isBatchingLegacy = prevIsBatchingLegacy;
            }
            if (result !== null && typeof result === "object" && typeof result.then === "function") {
              var thenableResult = result;
              var wasAwaited = false;
              var thenable = {
                then: function(resolve, reject) {
                  wasAwaited = true;
                  thenableResult.then(function(returnValue2) {
                    popActScope(prevActScopeDepth);
                    if (actScopeDepth === 0) {
                      recursivelyFlushAsyncActWork(returnValue2, resolve, reject);
                    } else {
                      resolve(returnValue2);
                    }
                  }, function(error2) {
                    popActScope(prevActScopeDepth);
                    reject(error2);
                  });
                }
              };
              {
                if (!didWarnNoAwaitAct && typeof Promise !== "undefined") {
                  Promise.resolve().then(function() {
                  }).then(function() {
                    if (!wasAwaited) {
                      didWarnNoAwaitAct = true;
                      error("You called act(async () => ...) without await. This could lead to unexpected testing behaviour, interleaving multiple act calls and mixing their scopes. You should - await act(async () => ...);");
                    }
                  });
                }
              }
              return thenable;
            } else {
              var returnValue = result;
              popActScope(prevActScopeDepth);
              if (actScopeDepth === 0) {
                var _queue = ReactCurrentActQueue.current;
                if (_queue !== null) {
                  flushActQueue(_queue);
                  ReactCurrentActQueue.current = null;
                }
                var _thenable = {
                  then: function(resolve, reject) {
                    if (ReactCurrentActQueue.current === null) {
                      ReactCurrentActQueue.current = [];
                      recursivelyFlushAsyncActWork(returnValue, resolve, reject);
                    } else {
                      resolve(returnValue);
                    }
                  }
                };
                return _thenable;
              } else {
                var _thenable2 = {
                  then: function(resolve, reject) {
                    resolve(returnValue);
                  }
                };
                return _thenable2;
              }
            }
          }
        }
        function popActScope(prevActScopeDepth) {
          {
            if (prevActScopeDepth !== actScopeDepth - 1) {
              error("You seem to have overlapping act() calls, this is not supported. Be sure to await previous act() calls before making a new one. ");
            }
            actScopeDepth = prevActScopeDepth;
          }
        }
        function recursivelyFlushAsyncActWork(returnValue, resolve, reject) {
          {
            var queue = ReactCurrentActQueue.current;
            if (queue !== null) {
              try {
                flushActQueue(queue);
                enqueueTask(function() {
                  if (queue.length === 0) {
                    ReactCurrentActQueue.current = null;
                    resolve(returnValue);
                  } else {
                    recursivelyFlushAsyncActWork(returnValue, resolve, reject);
                  }
                });
              } catch (error2) {
                reject(error2);
              }
            } else {
              resolve(returnValue);
            }
          }
        }
        var isFlushing = false;
        function flushActQueue(queue) {
          {
            if (!isFlushing) {
              isFlushing = true;
              var i = 0;
              try {
                for (; i < queue.length; i++) {
                  var callback = queue[i];
                  do {
                    callback = callback(true);
                  } while (callback !== null);
                }
                queue.length = 0;
              } catch (error2) {
                queue = queue.slice(i + 1);
                throw error2;
              } finally {
                isFlushing = false;
              }
            }
          }
        }
        var createElement$1 = createElementWithValidation;
        var cloneElement$1 = cloneElementWithValidation;
        var createFactory = createFactoryWithValidation;
        var Children = {
          map: mapChildren,
          forEach: forEachChildren,
          count: countChildren,
          toArray,
          only: onlyChild
        };
        exports2.Children = Children;
        exports2.Component = Component;
        exports2.Fragment = REACT_FRAGMENT_TYPE;
        exports2.Profiler = REACT_PROFILER_TYPE;
        exports2.PureComponent = PureComponent;
        exports2.StrictMode = REACT_STRICT_MODE_TYPE;
        exports2.Suspense = REACT_SUSPENSE_TYPE;
        exports2.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = ReactSharedInternals;
        exports2.act = act;
        exports2.cloneElement = cloneElement$1;
        exports2.createContext = createContext;
        exports2.createElement = createElement$1;
        exports2.createFactory = createFactory;
        exports2.createRef = createRef;
        exports2.forwardRef = forwardRef;
        exports2.isValidElement = isValidElement;
        exports2.lazy = lazy;
        exports2.memo = memo;
        exports2.startTransition = startTransition;
        exports2.unstable_act = act;
        exports2.useCallback = useCallback;
        exports2.useContext = useContext;
        exports2.useDebugValue = useDebugValue2;
        exports2.useDeferredValue = useDeferredValue;
        exports2.useEffect = useEffect;
        exports2.useId = useId;
        exports2.useImperativeHandle = useImperativeHandle;
        exports2.useInsertionEffect = useInsertionEffect;
        exports2.useLayoutEffect = useLayoutEffect;
        exports2.useMemo = useMemo;
        exports2.useReducer = useReducer;
        exports2.useRef = useRef;
        exports2.useState = useState;
        exports2.useSyncExternalStore = useSyncExternalStore;
        exports2.useTransition = useTransition;
        exports2.version = ReactVersion;
        if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== "undefined" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop === "function") {
          __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(new Error());
        }
      })();
    }
  }
});

// node_modules/react/index.js
var require_react = __commonJS({
  "node_modules/react/index.js"(exports2, module2) {
    "use strict";
    if (process.env.NODE_ENV === "production") {
      module2.exports = require_react_production_min();
    } else {
      module2.exports = require_react_development();
    }
  }
});

// node_modules/use-sync-external-store/cjs/use-sync-external-store-shim.production.js
var require_use_sync_external_store_shim_production = __commonJS({
  "node_modules/use-sync-external-store/cjs/use-sync-external-store-shim.production.js"(exports2) {
    "use strict";
    var React = require_react();
    function is(x, y) {
      return x === y && (0 !== x || 1 / x === 1 / y) || x !== x && y !== y;
    }
    var objectIs = "function" === typeof Object.is ? Object.is : is;
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useLayoutEffect = React.useLayoutEffect;
    var useDebugValue2 = React.useDebugValue;
    function useSyncExternalStore$2(subscribe, getSnapshot) {
      var value = getSnapshot(), _useState = useState({ inst: { value, getSnapshot } }), inst = _useState[0].inst, forceUpdate = _useState[1];
      useLayoutEffect(
        function() {
          inst.value = value;
          inst.getSnapshot = getSnapshot;
          checkIfSnapshotChanged(inst) && forceUpdate({ inst });
        },
        [subscribe, value, getSnapshot]
      );
      useEffect(
        function() {
          checkIfSnapshotChanged(inst) && forceUpdate({ inst });
          return subscribe(function() {
            checkIfSnapshotChanged(inst) && forceUpdate({ inst });
          });
        },
        [subscribe]
      );
      useDebugValue2(value);
      return value;
    }
    function checkIfSnapshotChanged(inst) {
      var latestGetSnapshot = inst.getSnapshot;
      inst = inst.value;
      try {
        var nextValue = latestGetSnapshot();
        return !objectIs(inst, nextValue);
      } catch (error) {
        return true;
      }
    }
    function useSyncExternalStore$1(subscribe, getSnapshot) {
      return getSnapshot();
    }
    var shim = "undefined" === typeof window || "undefined" === typeof window.document || "undefined" === typeof window.document.createElement ? useSyncExternalStore$1 : useSyncExternalStore$2;
    exports2.useSyncExternalStore = void 0 !== React.useSyncExternalStore ? React.useSyncExternalStore : shim;
  }
});

// node_modules/use-sync-external-store/cjs/use-sync-external-store-shim.development.js
var require_use_sync_external_store_shim_development = __commonJS({
  "node_modules/use-sync-external-store/cjs/use-sync-external-store-shim.development.js"(exports2) {
    "use strict";
    "production" !== process.env.NODE_ENV && function() {
      function is(x, y) {
        return x === y && (0 !== x || 1 / x === 1 / y) || x !== x && y !== y;
      }
      function useSyncExternalStore$2(subscribe, getSnapshot) {
        didWarnOld18Alpha || void 0 === React.startTransition || (didWarnOld18Alpha = true, console.error(
          "You are using an outdated, pre-release alpha of React 18 that does not support useSyncExternalStore. The use-sync-external-store shim will not work correctly. Upgrade to a newer pre-release."
        ));
        var value = getSnapshot();
        if (!didWarnUncachedGetSnapshot) {
          var cachedValue = getSnapshot();
          objectIs(value, cachedValue) || (console.error(
            "The result of getSnapshot should be cached to avoid an infinite loop"
          ), didWarnUncachedGetSnapshot = true);
        }
        cachedValue = useState({
          inst: { value, getSnapshot }
        });
        var inst = cachedValue[0].inst, forceUpdate = cachedValue[1];
        useLayoutEffect(
          function() {
            inst.value = value;
            inst.getSnapshot = getSnapshot;
            checkIfSnapshotChanged(inst) && forceUpdate({ inst });
          },
          [subscribe, value, getSnapshot]
        );
        useEffect(
          function() {
            checkIfSnapshotChanged(inst) && forceUpdate({ inst });
            return subscribe(function() {
              checkIfSnapshotChanged(inst) && forceUpdate({ inst });
            });
          },
          [subscribe]
        );
        useDebugValue2(value);
        return value;
      }
      function checkIfSnapshotChanged(inst) {
        var latestGetSnapshot = inst.getSnapshot;
        inst = inst.value;
        try {
          var nextValue = latestGetSnapshot();
          return !objectIs(inst, nextValue);
        } catch (error) {
          return true;
        }
      }
      function useSyncExternalStore$1(subscribe, getSnapshot) {
        return getSnapshot();
      }
      "undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
      var React = require_react(), objectIs = "function" === typeof Object.is ? Object.is : is, useState = React.useState, useEffect = React.useEffect, useLayoutEffect = React.useLayoutEffect, useDebugValue2 = React.useDebugValue, didWarnOld18Alpha = false, didWarnUncachedGetSnapshot = false, shim = "undefined" === typeof window || "undefined" === typeof window.document || "undefined" === typeof window.document.createElement ? useSyncExternalStore$1 : useSyncExternalStore$2;
      exports2.useSyncExternalStore = void 0 !== React.useSyncExternalStore ? React.useSyncExternalStore : shim;
      "undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
    }();
  }
});

// node_modules/use-sync-external-store/shim/index.js
var require_shim = __commonJS({
  "node_modules/use-sync-external-store/shim/index.js"(exports2, module2) {
    "use strict";
    if (process.env.NODE_ENV === "production") {
      module2.exports = require_use_sync_external_store_shim_production();
    } else {
      module2.exports = require_use_sync_external_store_shim_development();
    }
  }
});

// node_modules/use-sync-external-store/cjs/use-sync-external-store-shim/with-selector.production.js
var require_with_selector_production = __commonJS({
  "node_modules/use-sync-external-store/cjs/use-sync-external-store-shim/with-selector.production.js"(exports2) {
    "use strict";
    var React = require_react();
    var shim = require_shim();
    function is(x, y) {
      return x === y && (0 !== x || 1 / x === 1 / y) || x !== x && y !== y;
    }
    var objectIs = "function" === typeof Object.is ? Object.is : is;
    var useSyncExternalStore = shim.useSyncExternalStore;
    var useRef = React.useRef;
    var useEffect = React.useEffect;
    var useMemo = React.useMemo;
    var useDebugValue2 = React.useDebugValue;
    exports2.useSyncExternalStoreWithSelector = function(subscribe, getSnapshot, getServerSnapshot, selector, isEqual) {
      var instRef = useRef(null);
      if (null === instRef.current) {
        var inst = { hasValue: false, value: null };
        instRef.current = inst;
      } else inst = instRef.current;
      instRef = useMemo(
        function() {
          function memoizedSelector(nextSnapshot) {
            if (!hasMemo) {
              hasMemo = true;
              memoizedSnapshot = nextSnapshot;
              nextSnapshot = selector(nextSnapshot);
              if (void 0 !== isEqual && inst.hasValue) {
                var currentSelection = inst.value;
                if (isEqual(currentSelection, nextSnapshot))
                  return memoizedSelection = currentSelection;
              }
              return memoizedSelection = nextSnapshot;
            }
            currentSelection = memoizedSelection;
            if (objectIs(memoizedSnapshot, nextSnapshot)) return currentSelection;
            var nextSelection = selector(nextSnapshot);
            if (void 0 !== isEqual && isEqual(currentSelection, nextSelection))
              return memoizedSnapshot = nextSnapshot, currentSelection;
            memoizedSnapshot = nextSnapshot;
            return memoizedSelection = nextSelection;
          }
          var hasMemo = false, memoizedSnapshot, memoizedSelection, maybeGetServerSnapshot = void 0 === getServerSnapshot ? null : getServerSnapshot;
          return [
            function() {
              return memoizedSelector(getSnapshot());
            },
            null === maybeGetServerSnapshot ? void 0 : function() {
              return memoizedSelector(maybeGetServerSnapshot());
            }
          ];
        },
        [getSnapshot, getServerSnapshot, selector, isEqual]
      );
      var value = useSyncExternalStore(subscribe, instRef[0], instRef[1]);
      useEffect(
        function() {
          inst.hasValue = true;
          inst.value = value;
        },
        [value]
      );
      useDebugValue2(value);
      return value;
    };
  }
});

// node_modules/use-sync-external-store/cjs/use-sync-external-store-shim/with-selector.development.js
var require_with_selector_development = __commonJS({
  "node_modules/use-sync-external-store/cjs/use-sync-external-store-shim/with-selector.development.js"(exports2) {
    "use strict";
    "production" !== process.env.NODE_ENV && function() {
      function is(x, y) {
        return x === y && (0 !== x || 1 / x === 1 / y) || x !== x && y !== y;
      }
      "undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
      var React = require_react(), shim = require_shim(), objectIs = "function" === typeof Object.is ? Object.is : is, useSyncExternalStore = shim.useSyncExternalStore, useRef = React.useRef, useEffect = React.useEffect, useMemo = React.useMemo, useDebugValue2 = React.useDebugValue;
      exports2.useSyncExternalStoreWithSelector = function(subscribe, getSnapshot, getServerSnapshot, selector, isEqual) {
        var instRef = useRef(null);
        if (null === instRef.current) {
          var inst = { hasValue: false, value: null };
          instRef.current = inst;
        } else inst = instRef.current;
        instRef = useMemo(
          function() {
            function memoizedSelector(nextSnapshot) {
              if (!hasMemo) {
                hasMemo = true;
                memoizedSnapshot = nextSnapshot;
                nextSnapshot = selector(nextSnapshot);
                if (void 0 !== isEqual && inst.hasValue) {
                  var currentSelection = inst.value;
                  if (isEqual(currentSelection, nextSnapshot))
                    return memoizedSelection = currentSelection;
                }
                return memoizedSelection = nextSnapshot;
              }
              currentSelection = memoizedSelection;
              if (objectIs(memoizedSnapshot, nextSnapshot))
                return currentSelection;
              var nextSelection = selector(nextSnapshot);
              if (void 0 !== isEqual && isEqual(currentSelection, nextSelection))
                return memoizedSnapshot = nextSnapshot, currentSelection;
              memoizedSnapshot = nextSnapshot;
              return memoizedSelection = nextSelection;
            }
            var hasMemo = false, memoizedSnapshot, memoizedSelection, maybeGetServerSnapshot = void 0 === getServerSnapshot ? null : getServerSnapshot;
            return [
              function() {
                return memoizedSelector(getSnapshot());
              },
              null === maybeGetServerSnapshot ? void 0 : function() {
                return memoizedSelector(maybeGetServerSnapshot());
              }
            ];
          },
          [getSnapshot, getServerSnapshot, selector, isEqual]
        );
        var value = useSyncExternalStore(subscribe, instRef[0], instRef[1]);
        useEffect(
          function() {
            inst.hasValue = true;
            inst.value = value;
          },
          [value]
        );
        useDebugValue2(value);
        return value;
      };
      "undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
    }();
  }
});

// node_modules/use-sync-external-store/shim/with-selector.js
var require_with_selector = __commonJS({
  "node_modules/use-sync-external-store/shim/with-selector.js"(exports2, module2) {
    "use strict";
    if (process.env.NODE_ENV === "production") {
      module2.exports = require_with_selector_production();
    } else {
      module2.exports = require_with_selector_development();
    }
  }
});

// src/store.ts
var store_exports = {};
__export(store_exports, {
  useLedger: () => useLedger,
  useTotalAssets: () => useTotalAssets
});
module.exports = __toCommonJS(store_exports);

// node_modules/zustand/esm/vanilla.mjs
var import_meta = {};
var createStoreImpl = (createState) => {
  let state;
  const listeners = /* @__PURE__ */ new Set();
  const setState = (partial, replace) => {
    const nextState = typeof partial === "function" ? partial(state) : partial;
    if (!Object.is(nextState, state)) {
      const previousState = state;
      state = (replace != null ? replace : typeof nextState !== "object" || nextState === null) ? nextState : Object.assign({}, state, nextState);
      listeners.forEach((listener) => listener(state, previousState));
    }
  };
  const getState = () => state;
  const getInitialState = () => initialState;
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const destroy = () => {
    if ((import_meta.env ? import_meta.env.MODE : void 0) !== "production") {
      console.warn(
        "[DEPRECATED] The `destroy` method will be unsupported in a future version. Instead use unsubscribe function returned by subscribe. Everything will be garbage-collected if store is garbage-collected."
      );
    }
    listeners.clear();
  };
  const api = { setState, getState, getInitialState, subscribe, destroy };
  const initialState = state = createState(setState, getState, api);
  return api;
};
var createStore = (createState) => createState ? createStoreImpl(createState) : createStoreImpl;

// node_modules/zustand/esm/index.mjs
var import_react = __toESM(require_react(), 1);
var import_with_selector = __toESM(require_with_selector(), 1);
var import_meta2 = {};
var { useDebugValue } = import_react.default;
var { useSyncExternalStoreWithSelector } = import_with_selector.default;
var didWarnAboutEqualityFn = false;
var identity = (arg) => arg;
function useStore(api, selector = identity, equalityFn) {
  if ((import_meta2.env ? import_meta2.env.MODE : void 0) !== "production" && equalityFn && !didWarnAboutEqualityFn) {
    console.warn(
      "[DEPRECATED] Use `createWithEqualityFn` instead of `create` or use `useStoreWithEqualityFn` instead of `useStore`. They can be imported from 'zustand/traditional'. https://github.com/pmndrs/zustand/discussions/1937"
    );
    didWarnAboutEqualityFn = true;
  }
  const slice = useSyncExternalStoreWithSelector(
    api.subscribe,
    api.getState,
    api.getServerState || api.getInitialState,
    selector,
    equalityFn
  );
  useDebugValue(slice);
  return slice;
}
var createImpl = (createState) => {
  if ((import_meta2.env ? import_meta2.env.MODE : void 0) !== "production" && typeof createState !== "function") {
    console.warn(
      "[DEPRECATED] Passing a vanilla store will be unsupported in a future version. Instead use `import { useStore } from 'zustand'`."
    );
  }
  const api = typeof createState === "function" ? createStore(createState) : createState;
  const useBoundStore = (selector, equalityFn) => useStore(api, selector, equalityFn);
  Object.assign(useBoundStore, api);
  return useBoundStore;
};
var create = (createState) => createState ? createImpl(createState) : createImpl;

// node_modules/zustand/esm/middleware.mjs
var import_meta3 = {};
function createJSONStorage(getStorage, options) {
  let storage;
  try {
    storage = getStorage();
  } catch (_e) {
    return;
  }
  const persistStorage = {
    getItem: (name) => {
      var _a;
      const parse = (str2) => {
        if (str2 === null) {
          return null;
        }
        return JSON.parse(str2, options == null ? void 0 : options.reviver);
      };
      const str = (_a = storage.getItem(name)) != null ? _a : null;
      if (str instanceof Promise) {
        return str.then(parse);
      }
      return parse(str);
    },
    setItem: (name, newValue) => storage.setItem(
      name,
      JSON.stringify(newValue, options == null ? void 0 : options.replacer)
    ),
    removeItem: (name) => storage.removeItem(name)
  };
  return persistStorage;
}
var toThenable = (fn) => (input) => {
  try {
    const result = fn(input);
    if (result instanceof Promise) {
      return result;
    }
    return {
      then(onFulfilled) {
        return toThenable(onFulfilled)(result);
      },
      catch(_onRejected) {
        return this;
      }
    };
  } catch (e) {
    return {
      then(_onFulfilled) {
        return this;
      },
      catch(onRejected) {
        return toThenable(onRejected)(e);
      }
    };
  }
};
var oldImpl = (config, baseOptions) => (set, get, api) => {
  let options = {
    getStorage: () => localStorage,
    serialize: JSON.stringify,
    deserialize: JSON.parse,
    partialize: (state) => state,
    version: 0,
    merge: (persistedState, currentState) => ({
      ...currentState,
      ...persistedState
    }),
    ...baseOptions
  };
  let hasHydrated = false;
  const hydrationListeners = /* @__PURE__ */ new Set();
  const finishHydrationListeners = /* @__PURE__ */ new Set();
  let storage;
  try {
    storage = options.getStorage();
  } catch (_e) {
  }
  if (!storage) {
    return config(
      (...args) => {
        console.warn(
          `[zustand persist middleware] Unable to update item '${options.name}', the given storage is currently unavailable.`
        );
        set(...args);
      },
      get,
      api
    );
  }
  const thenableSerialize = toThenable(options.serialize);
  const setItem = () => {
    const state = options.partialize({ ...get() });
    let errorInSync;
    const thenable = thenableSerialize({ state, version: options.version }).then(
      (serializedValue) => storage.setItem(options.name, serializedValue)
    ).catch((e) => {
      errorInSync = e;
    });
    if (errorInSync) {
      throw errorInSync;
    }
    return thenable;
  };
  const savedSetState = api.setState;
  api.setState = (state, replace) => {
    savedSetState(state, replace);
    void setItem();
  };
  const configResult = config(
    (...args) => {
      set(...args);
      void setItem();
    },
    get,
    api
  );
  let stateFromStorage;
  const hydrate = () => {
    var _a;
    if (!storage) return;
    hasHydrated = false;
    hydrationListeners.forEach((cb) => cb(get()));
    const postRehydrationCallback = ((_a = options.onRehydrateStorage) == null ? void 0 : _a.call(options, get())) || void 0;
    return toThenable(storage.getItem.bind(storage))(options.name).then((storageValue) => {
      if (storageValue) {
        return options.deserialize(storageValue);
      }
    }).then((deserializedStorageValue) => {
      if (deserializedStorageValue) {
        if (typeof deserializedStorageValue.version === "number" && deserializedStorageValue.version !== options.version) {
          if (options.migrate) {
            return options.migrate(
              deserializedStorageValue.state,
              deserializedStorageValue.version
            );
          }
          console.error(
            `State loaded from storage couldn't be migrated since no migrate function was provided`
          );
        } else {
          return deserializedStorageValue.state;
        }
      }
    }).then((migratedState) => {
      var _a2;
      stateFromStorage = options.merge(
        migratedState,
        (_a2 = get()) != null ? _a2 : configResult
      );
      set(stateFromStorage, true);
      return setItem();
    }).then(() => {
      postRehydrationCallback == null ? void 0 : postRehydrationCallback(stateFromStorage, void 0);
      hasHydrated = true;
      finishHydrationListeners.forEach((cb) => cb(stateFromStorage));
    }).catch((e) => {
      postRehydrationCallback == null ? void 0 : postRehydrationCallback(void 0, e);
    });
  };
  api.persist = {
    setOptions: (newOptions) => {
      options = {
        ...options,
        ...newOptions
      };
      if (newOptions.getStorage) {
        storage = newOptions.getStorage();
      }
    },
    clearStorage: () => {
      storage == null ? void 0 : storage.removeItem(options.name);
    },
    getOptions: () => options,
    rehydrate: () => hydrate(),
    hasHydrated: () => hasHydrated,
    onHydrate: (cb) => {
      hydrationListeners.add(cb);
      return () => {
        hydrationListeners.delete(cb);
      };
    },
    onFinishHydration: (cb) => {
      finishHydrationListeners.add(cb);
      return () => {
        finishHydrationListeners.delete(cb);
      };
    }
  };
  hydrate();
  return stateFromStorage || configResult;
};
var newImpl = (config, baseOptions) => (set, get, api) => {
  let options = {
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => state,
    version: 0,
    merge: (persistedState, currentState) => ({
      ...currentState,
      ...persistedState
    }),
    ...baseOptions
  };
  let hasHydrated = false;
  const hydrationListeners = /* @__PURE__ */ new Set();
  const finishHydrationListeners = /* @__PURE__ */ new Set();
  let storage = options.storage;
  if (!storage) {
    return config(
      (...args) => {
        console.warn(
          `[zustand persist middleware] Unable to update item '${options.name}', the given storage is currently unavailable.`
        );
        set(...args);
      },
      get,
      api
    );
  }
  const setItem = () => {
    const state = options.partialize({ ...get() });
    return storage.setItem(options.name, {
      state,
      version: options.version
    });
  };
  const savedSetState = api.setState;
  api.setState = (state, replace) => {
    savedSetState(state, replace);
    void setItem();
  };
  const configResult = config(
    (...args) => {
      set(...args);
      void setItem();
    },
    get,
    api
  );
  api.getInitialState = () => configResult;
  let stateFromStorage;
  const hydrate = () => {
    var _a, _b;
    if (!storage) return;
    hasHydrated = false;
    hydrationListeners.forEach((cb) => {
      var _a2;
      return cb((_a2 = get()) != null ? _a2 : configResult);
    });
    const postRehydrationCallback = ((_b = options.onRehydrateStorage) == null ? void 0 : _b.call(options, (_a = get()) != null ? _a : configResult)) || void 0;
    return toThenable(storage.getItem.bind(storage))(options.name).then((deserializedStorageValue) => {
      if (deserializedStorageValue) {
        if (typeof deserializedStorageValue.version === "number" && deserializedStorageValue.version !== options.version) {
          if (options.migrate) {
            return [
              true,
              options.migrate(
                deserializedStorageValue.state,
                deserializedStorageValue.version
              )
            ];
          }
          console.error(
            `State loaded from storage couldn't be migrated since no migrate function was provided`
          );
        } else {
          return [false, deserializedStorageValue.state];
        }
      }
      return [false, void 0];
    }).then((migrationResult) => {
      var _a2;
      const [migrated, migratedState] = migrationResult;
      stateFromStorage = options.merge(
        migratedState,
        (_a2 = get()) != null ? _a2 : configResult
      );
      set(stateFromStorage, true);
      if (migrated) {
        return setItem();
      }
    }).then(() => {
      postRehydrationCallback == null ? void 0 : postRehydrationCallback(stateFromStorage, void 0);
      stateFromStorage = get();
      hasHydrated = true;
      finishHydrationListeners.forEach((cb) => cb(stateFromStorage));
    }).catch((e) => {
      postRehydrationCallback == null ? void 0 : postRehydrationCallback(void 0, e);
    });
  };
  api.persist = {
    setOptions: (newOptions) => {
      options = {
        ...options,
        ...newOptions
      };
      if (newOptions.storage) {
        storage = newOptions.storage;
      }
    },
    clearStorage: () => {
      storage == null ? void 0 : storage.removeItem(options.name);
    },
    getOptions: () => options,
    rehydrate: () => hydrate(),
    hasHydrated: () => hasHydrated,
    onHydrate: (cb) => {
      hydrationListeners.add(cb);
      return () => {
        hydrationListeners.delete(cb);
      };
    },
    onFinishHydration: (cb) => {
      finishHydrationListeners.add(cb);
      return () => {
        finishHydrationListeners.delete(cb);
      };
    }
  };
  if (!options.skipHydration) {
    hydrate();
  }
  return stateFromStorage || configResult;
};
var persistImpl = (config, baseOptions) => {
  if ("getStorage" in baseOptions || "serialize" in baseOptions || "deserialize" in baseOptions) {
    if ((import_meta3.env ? import_meta3.env.MODE : void 0) !== "production") {
      console.warn(
        "[DEPRECATED] `getStorage`, `serialize` and `deserialize` options are deprecated. Use `storage` option instead."
      );
    }
    return oldImpl(config, baseOptions);
  }
  return newImpl(config, baseOptions);
};
var persist = persistImpl;

// src/taxonomy.ts
var TAXONOMY_PARENTS = [
  { id: 1, name: "\u5065\u5EB7\u533B\u7597", parentId: 0, kind: "expense", color: "#C2410C", bg: "#FFE0CC", positionWeight: 1, icon: "ic_parent_medical" },
  { id: 2, name: "\u9001\u793C\u4EBA\u60C5", parentId: 0, kind: "expense", color: "#C2410C", bg: "#FFE0CC", positionWeight: 2, icon: "ic_parent_gift" },
  { id: 3, name: "\u6587\u5316\u6559\u80B2", parentId: 0, kind: "expense", color: "#C2410C", bg: "#FFE0CC", positionWeight: 3, icon: "ic_parent_education" },
  { id: 4, name: "\u5C45\u5BB6\u751F\u6D3B", parentId: 0, kind: "expense", color: "#C2410C", bg: "#FFE0CC", positionWeight: 4, icon: "ic_parent_home" },
  { id: 5, name: "\u4F11\u95F2\u5A31\u4E50", parentId: 0, kind: "expense", color: "#C2410C", bg: "#FFE0CC", positionWeight: 5, icon: "ic_parent_game" },
  { id: 6, name: "\u51FA\u884C\u4EA4\u901A", parentId: 0, kind: "expense", color: "#C2410C", bg: "#FFE0CC", positionWeight: 6, icon: "ic_parent_traffic" },
  { id: 7, name: "\u98DF\u54C1\u9910\u996E", parentId: 0, kind: "expense", color: "#C2410C", bg: "#FFE0CC", positionWeight: 7, icon: "ic_parent_restaurant" },
  { id: 9, name: "\u65C5\u6E38\u5EA6\u5047", parentId: 0, kind: "expense", color: "#0F766E", bg: "#CCFBF1", positionWeight: 9, icon: "ic_parent_travel" },
  { id: 10, name: "\u5176\u4ED6", parentId: 0, kind: "expense", color: "#57534E", bg: "#EDE9E3", positionWeight: 10, icon: "ic_parent_other" },
  { id: 8, name: "\u8D2D\u7269\u6D88\u8D39", parentId: 0, kind: "expense", color: "#C2410C", bg: "#FFE0CC", positionWeight: 8, icon: "ic_parent_shopping" }
];
var TAXONOMY_INCOME = [
  { id: 901, name: "\u5DE5\u8D44", parentId: 0, kind: "income", color: "#22c55e", positionWeight: 0, icon: "ic_income_wages" },
  { id: 902, name: "\u5956\u91D1", parentId: 0, kind: "income", color: "#22c55e", positionWeight: 0, icon: "ic_income_bonus" },
  { id: 903, name: "\u8865\u8D34", parentId: 0, kind: "income", color: "#22c55e", positionWeight: 0, icon: "ic_income_subsidy" },
  { id: 904, name: "\u517C\u804C\u5916\u5FEB", parentId: 0, kind: "income", color: "#22c55e", positionWeight: 0, icon: "ic_income_part_time_job" },
  { id: 905, name: "\u7406\u8D22\u76C8\u5229", parentId: 0, kind: "income", color: "#22c55e", positionWeight: 0, icon: "ic_income_manager_money" },
  { id: 906, name: "\u793C\u91D1\u4EBA\u60C5", parentId: 0, kind: "income", color: "#22c55e", positionWeight: 0, icon: "ic_income_cash_gift" },
  { id: 907, name: "\u501F\u5165", parentId: 0, kind: "income", color: "#22c55e", positionWeight: 0, icon: "ic_income_borrow" },
  { id: 908, name: "\u4E2D\u5956", parentId: 0, kind: "income", color: "#22c55e", positionWeight: 0, icon: "ic_income_winning" },
  { id: 909, name: "\u4E8C\u624B\u95F2\u7F6E", parentId: 0, kind: "income", color: "#22c55e", positionWeight: 0, icon: "ic_income_second_hand" },
  { id: 910, name: "\u62A5\u9500", parentId: 0, kind: "income", color: "#22c55e", positionWeight: 0, icon: "ic_income_reimbursement" },
  { id: 911, name: "\u5176\u4ED6", parentId: 0, kind: "income", color: "#22c55e", positionWeight: 0, icon: "ic_income_other" }
];
var TAXONOMY_CHILDREN = [
  { id: 801, name: "\u793E\u4FDD", parentId: 1, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_medical_social_insurance" },
  { id: 802, name: "\u4FDD\u9669", parentId: 1, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_medical_insurance" },
  { id: 803, name: "\u623F\u79DF", parentId: 4, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_home_rent" },
  { id: 804, name: "\u53D1\u8D22\u6811", parentId: 4, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_home_money_tree" },
  { id: 805, name: "\u6E38\u620F", parentId: 5, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_game_video_game" },
  { id: 806, name: "APP\u4F1A\u5458", parentId: 5, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_game_app_member" },
  { id: 807, name: "ETC", parentId: 6, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_traffic_etc" },
  { id: 808, name: "\u9152\u5E97", parentId: 6, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_traffic_hotel" },
  { id: 809, name: "\u6E38\u73A9\u95E8\u7968", parentId: 6, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_traffic_ticket" },
  { id: 810, name: "\u6D77\u8FD0", parentId: 8, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_shopping_overseas" },
  { id: 811, name: "\u62FC\u591A\u591A", parentId: 8, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_shopping_pdd" },
  { id: 812, name: "\u7406\u53D1", parentId: 8, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_shopping_haircut" },
  { id: 820, name: "\u5176\u4ED6", parentId: 9, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_misc_other" },
  { id: 821, name: "\u9152\u5E97\u6C11\u5BBF", parentId: 9, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_travel_hotel" },
  { id: 822, name: "\u9152\u6C34\u996E\u6599", parentId: 9, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_travel_drinks" },
  { id: 823, name: "\u5730\u94C1", parentId: 9, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_travel_subway" },
  { id: 824, name: "\u8F6E\u8239", parentId: 9, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_travel_ship" },
  { id: 825, name: "\u6309\u6469", parentId: 9, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_travel_massage" },
  { id: 826, name: "\u673A\u7968", parentId: 9, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_travel_flight" },
  { id: 827, name: "\u95E8\u7968", parentId: 9, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_travel_ticket" },
  { id: 828, name: "\u6253\u8F66", parentId: 9, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_travel_taxi" },
  { id: 829, name: "\u9910\u98DF", parentId: 9, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_travel_meal" },
  { id: 830, name: "\u8D2D\u7269", parentId: 9, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_travel_shopping" },
  { id: 831, name: "\u7948\u613F\u8FD8\u613F", parentId: 9, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_travel_pray" },
  { id: 832, name: "\u706B\u8F66\u9AD8\u94C1", parentId: 9, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_travel_train" },
  { id: 840, name: "\u5176\u4ED6", parentId: 10, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_misc_other" },
  { id: 841, name: "\u6148\u5584\u6350\u52A9", parentId: 10, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_misc_charity" },
  { id: 842, name: "\u7406\u8D22\u652F\u51FA", parentId: 10, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_misc_invest_loss" },
  { id: 843, name: "\u7F5A\u6B3E\u8D54\u507F", parentId: 10, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_misc_penalty" },
  { id: 601, name: "\u5176\u4ED6", parentId: 1, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_misc_other" },
  { id: 602, name: "\u5176\u4ED6", parentId: 2, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_misc_other" },
  { id: 603, name: "\u5176\u4ED6", parentId: 3, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_misc_other" },
  { id: 604, name: "\u5176\u4ED6", parentId: 4, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_misc_other" },
  { id: 605, name: "\u5176\u4ED6", parentId: 5, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_misc_other" },
  { id: 606, name: "\u5176\u4ED6", parentId: 6, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_misc_other" },
  { id: 607, name: "\u5176\u4ED6", parentId: 7, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_misc_other" },
  { id: 608, name: "\u5176\u4ED6", parentId: 8, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_misc_other" },
  { id: 701, name: "\u852C\u83DC", parentId: 7, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_restaurant_vegetable" },
  { id: 702, name: "\u6C34\u679C", parentId: 7, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_restaurant_fruit" },
  { id: 703, name: "\u4E0B\u5348\u8336", parentId: 7, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_restaurant_afternoon_tea" },
  { id: 704, name: "\u591C\u5BB5", parentId: 7, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_restaurant_night_snack" },
  { id: 801, name: "\u88C5\u4FEE\u88C5\u9970", parentId: 8, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_shopping_renovation" },
  { id: 802, name: "\u529E\u516C\u7528\u54C1", parentId: 8, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_shopping_office" },
  { id: 803, name: "\u5BA0\u7269\u7528\u54C1", parentId: 8, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_shopping_pets" },
  { id: 804, name: "\u670D\u9970\u8FD0\u52A8", parentId: 8, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_shopping_motion" },
  { id: 805, name: "\u6BCD\u5A74\u73A9\u5177", parentId: 8, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_shopping_baby" },
  { id: 806, name: "\u914D\u9970\u8155\u8868", parentId: 8, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_shopping_watch" },
  { id: 807, name: "\u751F\u6D3B\u7535\u5668", parentId: 8, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_shopping_electric" },
  { id: 808, name: "\u865A\u62DF\u5145\u503C", parentId: 8, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_shopping_recharge" },
  { id: 809, name: "\u624B\u673A\u6570\u7801", parentId: 8, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_shopping_phone" },
  { id: 810, name: "\u4E2A\u62A4\u7F8E\u5986", parentId: 8, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_shopping_makeup" },
  { id: 811, name: "\u65E5\u5E38\u5BB6\u5C45", parentId: 8, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_shopping_home" },
  { id: 701, name: "\u7CAE\u6CB9\u8C03\u5473", parentId: 7, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_restaurant_foodstuff" },
  { id: 702, name: "\u8BF7\u5BA2\u5403\u996D", parentId: 7, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_restaurant_treat" },
  { id: 703, name: "\u751F\u9C9C\u98DF\u54C1", parentId: 7, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_restaurant_fresh" },
  { id: 704, name: "\u4F11\u95F2\u96F6\u98DF", parentId: 7, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_restaurant_snacks" },
  { id: 705, name: "\u996E\u6599\u9152\u6C34", parentId: 7, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_restaurant_wine" },
  { id: 706, name: "\u665A\u9910", parentId: 7, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_restaurant_dinner" },
  { id: 707, name: "\u5348\u9910", parentId: 7, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_restaurant_lunch" },
  { id: 708, name: "\u65E9\u9910", parentId: 7, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_restaurant_breakfast" },
  { id: 601, name: "\u4FDD\u517B\u4FEE\u8F66", parentId: 6, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_traffic_maintain" },
  { id: 602, name: "\u98DE\u673A", parentId: 6, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_traffic_aircraft" },
  { id: 603, name: "\u706B\u8F66", parentId: 6, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_traffic_train" },
  { id: 604, name: "\u52A0\u6CB9", parentId: 6, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_traffic_oil" },
  { id: 605, name: "\u505C\u8F66\u8D39", parentId: 6, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_traffic_parking" },
  { id: 606, name: "\u516C\u5171\u4EA4\u901A", parentId: 6, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_traffic_bus" },
  { id: 607, name: "\u6253\u8F66", parentId: 6, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_traffic_taxi" },
  { id: 501, name: "\u6F14\u51FA", parentId: 5, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_game_show" },
  { id: 502, name: "\u9152\u5427", parentId: 5, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_game_bar" },
  { id: 503, name: "\u68CB\u724C\u684C\u6E38", parentId: 5, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_game_chess" },
  { id: 504, name: "\u8DB3\u6D74\u6309\u6469", parentId: 5, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_game_foot_bath" },
  { id: 505, name: "\u8FD0\u52A8\u5065\u8EAB", parentId: 5, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_game_keep_fit" },
  { id: 506, name: "\u7535\u5F71\u5531\u6B4C", parentId: 5, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_game_film" },
  { id: 507, name: "\u65C5\u6E38\u5EA6\u5047", parentId: 5, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_game_travel" },
  { id: 401, name: "\u5BB6\u653F\u6E05\u6D01", parentId: 4, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_home_husekeeping" },
  { id: 402, name: "\u8F66\u4F4D\u8D39", parentId: 4, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_home_parking_lot" },
  { id: 403, name: "\u623F\u8D37", parentId: 4, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_home_loan" },
  { id: 404, name: "\u7269\u4E1A\u8D39", parentId: 4, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_home_property" },
  { id: 405, name: "\u71C3\u6C14\u8D39", parentId: 4, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_home_gas" },
  { id: 406, name: "\u6C34\u8D39", parentId: 4, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_home_water" },
  { id: 407, name: "\u7535\u8D39", parentId: 4, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_home_electricity_fees" },
  { id: 408, name: "\u8BDD\u8D39\u5BBD\u5E26", parentId: 4, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_home_telephone_bill" },
  { id: 301, name: "\u57F9\u8BAD\u8003\u8BD5", parentId: 3, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_education_train" },
  { id: 302, name: "\u4E66\u62A5\u6742\u5FD7", parentId: 3, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_education_book" },
  { id: 303, name: "\u5B66\u8D39", parentId: 3, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_education_tuition" },
  { id: 201, name: "\u6253\u8D4F", parentId: 2, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_gift_reward" },
  { id: 202, name: "\u7EA2\u5305", parentId: 2, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_gift_red_paper" },
  { id: 203, name: "\u501F\u51FA", parentId: 2, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_gift_lend" },
  { id: 204, name: "\u793C\u7269", parentId: 2, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_gift_gift" },
  { id: 205, name: "\u5B5D\u656C\u957F\u8F88", parentId: 2, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_gift_filial_piety" },
  { id: 101, name: "\u4E70\u836F", parentId: 1, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_medical_medicine" },
  { id: 102, name: "\u533B\u9662", parentId: 1, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_medical_hospital" },
  { id: 103, name: "\u6ECB\u8865\u4FDD\u5065", parentId: 1, kind: "expense", color: "#cbd5e1", positionWeight: 0, icon: "ic_medical_healthcare" }
];

// src/auth.ts
var currentUid = 0;
var PREFIX = "xiaoman-data";
var keyFor = (uid) => `${PREFIX}:${uid || "anon"}`;
var userStorage = {
  getItem: (_name) => localStorage.getItem(keyFor(currentUid)),
  setItem: (_name, value) => localStorage.setItem(keyFor(currentUid), value),
  removeItem: (_name) => localStorage.removeItem(keyFor(currentUid))
};

// src/store.ts
var NOW = () => Date.now();
var useLedger = create()(
  persist(
    (set, get) => ({
      userId: 1,
      token: null,
      currentBookId: 1,
      accountBooks: [{ accountBookId: 1, accountBookName: "\u65E5\u5E38\u8D26\u672C", userId: 1, createTime: NOW() }],
      assets: [],
      bills: [],
      parentCategories: [...TAXONOMY_PARENTS, ...TAXONOMY_INCOME],
      childCategories: TAXONOMY_CHILDREN,
      transfers: [],
      budgets: [],
      reimbursements: [],
      refunds: [],
      lends: [],
      cycles: [],
      currencies: [
        { code: "CNY", name: "\u4EBA\u6C11\u5E01", symbol: "\xA5", rate: 1, positionWeight: 100 },
        { code: "USD", name: "\u7F8E\u5143", symbol: "$", rate: 7.2, positionWeight: 90 },
        { code: "EUR", name: "\u6B27\u5143", symbol: "\u20AC", rate: 7.8, positionWeight: 80 },
        { code: "JPY", name: "\u65E5\u5143", symbol: "\xA5", rate: 0.048, positionWeight: 70 },
        { code: "HKD", name: "\u6E2F\u5E01", symbol: "HK$", rate: 0.92, positionWeight: 60 }
      ],
      defaultCurrency: "CNY",
      tombstones: [],
      lastSync: 0,
      lastParentId: 7,
      lastChildId: 0,
      lastAssetId: 0,
      seeded: false,
      addBill: (patch) => {
        const s = get();
        let billId = patch.billId ?? Math.floor(NOW() / 1e3);
        while (s.bills.some((b) => b.billId === billId)) billId++;
        const parent = s.parentCategories.find((c) => c.id === patch.parentCategoryId);
        const child = s.childCategories.find((c) => c.id === patch.childCategoryId);
        const asset = s.assets.find((a) => a.assetId === patch.assetId);
        const bill = {
          billId,
          time: patch.time ?? NOW(),
          cost: Number(patch.cost ?? 0),
          parentCategoryId: patch.parentCategoryId ?? 199,
          childCategoryId: patch.childCategoryId ?? 0,
          assetId: patch.assetId ?? 0,
          bookId: patch.bookId ?? s.currentBookId,
          remark: patch.remark ?? "",
          billType: patch.billType ?? 2,
          tags: patch.tags ?? [],
          userId: s.userId,
          updateTime: NOW(),
          // 冗余快照：改名不影响历史账单
          billShareInfo: {
            parentCategoryName: parent?.name ?? "",
            childCategoryName: child?.name ?? "",
            assetName: asset?.assetName ?? ""
          },
          // 可选字段原样透传（多币种、标记、地址、附件等）
          files: patch.files ?? [],
          currencyInfo: patch.currencyInfo,
          currencyAssetNumber: patch.currencyAssetNumber,
          currencyDiscountNumber: patch.currencyDiscountNumber,
          notIntoTotal: patch.notIntoTotal,
          notIntoBudget: patch.notIntoBudget,
          discountNumber: patch.discountNumber,
          refundNum: patch.refundNum,
          poiAddress: patch.poiAddress,
          fromUserId: patch.fromUserId,
          isReimbursement: patch.isReimbursement,
          reimbursementNum: patch.reimbursementNum
        };
        const assets = s.assets.map((a) => {
          if (a.assetId !== bill.assetId) return a;
          const isIncome = (parent?.kind ?? "expense") === "income";
          const delta = isIncome ? bill.cost : -bill.cost;
          return { ...a, assetNumber: +(a.assetNumber + delta).toFixed(2), updateTime: NOW() };
        });
        set({
          bills: [bill, ...s.bills],
          assets,
          lastParentId: bill.parentCategoryId,
          lastChildId: bill.childCategoryId,
          lastAssetId: bill.assetId
        });
        return bill;
      },
      // 删除同样要冲正：把该账单对账户的影响退回
      deleteBill: (billId) => set((s) => {
        const tomb = { kind: "bill", id: String(billId), updatedAt: NOW() };
        const old = s.bills.find((b) => b.billId === billId);
        if (!old) return {};
        const sign = s.parentCategories.find((p) => p.id === old.parentCategoryId)?.kind === "income" ? 1 : -1;
        return {
          bills: s.bills.filter((b) => b.billId !== billId),
          assets: s.assets.map((a) => a.assetId === old.assetId ? { ...a, assetNumber: +(a.assetNumber - sign * old.cost).toFixed(2), updateTime: NOW() } : a),
          tombstones: [...s.tombstones, tomb]
        };
      }),
      // 改单：先把旧账单对账户的影响撤回，再按新值重新记一次
      updateBill: (billId, patch) => {
        const s = get();
        const old = s.bills.find((b) => b.billId === billId);
        if (!old) return;
        const deltaOf = (b) => (s.parentCategories.find((p) => p.id === b.parentCategoryId)?.kind === "income" ? 1 : -1) * b.cost;
        let assets = s.assets.map((a) => a.assetId === old.assetId ? { ...a, assetNumber: +(a.assetNumber - deltaOf(old)).toFixed(2) } : a);
        const next = { ...old, ...patch, updateTime: NOW() };
        const parent = s.parentCategories.find((p) => p.id === next.parentCategoryId);
        const asset = s.assets.find((a) => a.assetId === next.assetId);
        next.billShareInfo = {
          parentCategoryName: parent?.name ?? "",
          childCategoryName: s.childCategories.find((c) => c.id === next.childCategoryId)?.name ?? "",
          assetName: asset?.assetName ?? ""
        };
        assets = assets.map((a) => a.assetId === next.assetId ? { ...a, assetNumber: +(a.assetNumber + deltaOf(next)).toFixed(2), updateTime: NOW() } : a);
        set({ bills: s.bills.map((b) => b.billId === billId ? next : b), assets });
      },
      // 转账：本金不计收支；手续费若 >0 则单独生成一条支出账单（与原产品一致）
      // 注意：本金必须从转出方扣、给转入方加；手续费是额外的一笔支出账单。
      addTransfer: (patch) => {
        const s = get();
        let transferId = Math.floor(NOW() / 1e3);
        while (s.transfers.some((t2) => t2.transferId === transferId)) transferId++;
        const fee = Number(patch.serviceCharge ?? 0);
        const time = patch.time ?? NOW();
        const toCost = Number(patch.toCost ?? patch.cost);
        set((st) => ({
          assets: st.assets.map((a) => {
            if (a.assetId === patch.fromAssetId) return { ...a, assetNumber: +(a.assetNumber - patch.cost).toFixed(2), updateTime: NOW() };
            if (a.assetId === patch.toAssetId) return { ...a, assetNumber: +(a.assetNumber + toCost).toFixed(2), updateTime: NOW() };
            return a;
          })
        }));
        let billId = 0;
        if (fee > 0) {
          const bill = get().addBill({
            cost: fee,
            parentCategoryId: 199,
            childCategoryId: 0,
            assetId: patch.fromAssetId,
            remark: `\u8F6C\u8D26\u624B\u7EED\u8D39${patch.remark ? "\uFF1A" + patch.remark : ""}`,
            billType: 5,
            time
          });
          billId = bill.billId;
        }
        const t = {
          transferId,
          fromAssetId: patch.fromAssetId,
          toAssetId: patch.toAssetId,
          cost: Number(patch.cost),
          toCost,
          serviceCharge: fee,
          billId,
          time,
          remark: patch.remark ?? "",
          tags: [],
          userId: s.userId,
          updateTime: NOW()
        };
        set((st) => ({ transfers: [t, ...st.transfers] }));
        return t;
      },
      // 改转账：先完整撤销旧记录（含手续费账单），再按新值重记
      updateTransfer: (transferId, patch) => {
        const s = get();
        const old = s.transfers.find((t) => t.transferId === transferId);
        if (!old) return;
        const feeBill = old.billId ? s.bills.find((b) => b.billId === old.billId) : void 0;
        const feeBack = feeBill ? feeBill.cost : 0;
        set((st) => ({
          transfers: st.transfers.filter((t) => t.transferId !== transferId),
          bills: old.billId ? st.bills.filter((b) => b.billId !== old.billId) : st.bills,
          assets: st.assets.map((a) => {
            let v = a.assetNumber;
            if (a.assetId === old.fromAssetId) v += old.cost + feeBack;
            if (a.assetId === old.toAssetId) v -= old.toCost ?? old.cost;
            return v === a.assetNumber ? a : { ...a, assetNumber: +v.toFixed(2), updateTime: NOW() };
          })
        }));
        get().addTransfer({
          fromAssetId: patch.fromAssetId ?? old.fromAssetId,
          toAssetId: patch.toAssetId ?? old.toAssetId,
          cost: patch.cost ?? old.cost,
          toCost: patch.toCost ?? old.toCost ?? old.cost,
          serviceCharge: patch.serviceCharge ?? old.serviceCharge,
          time: patch.time ?? old.time,
          remark: patch.remark ?? old.remark
        });
      },
      addAsset: (patch) => set((s) => {
        const id = patch.assetId ?? NOW();
        const asset = {
          assetId: id,
          assetName: patch.assetName ?? "\u672A\u547D\u540D\u8D26\u6237",
          assetType: patch.assetType ?? 1,
          assetNumber: Number(patch.assetNumber ?? 0),
          groupName: patch.groupName ?? "",
          hide: false,
          intoTotalAsset: true,
          positionWeight: s.assets.length,
          remark: patch.remark ?? "",
          userId: s.userId,
          updateTime: NOW()
        };
        return { assets: [...s.assets, asset] };
      }),
      // 删转账：转出方退回本金+手续费，转入方扣回本金
      deleteTransfer: (transferId) => set((s) => {
        const t = s.transfers.find((x) => x.transferId === transferId);
        if (!t) return {};
        const back = t.cost + t.serviceCharge;
        const toBack = t.toCost ?? t.cost;
        return {
          transfers: s.transfers.filter((x) => x.transferId !== transferId),
          bills: t.billId ? s.bills.filter((b) => b.billId !== t.billId) : s.bills,
          assets: s.assets.map((a) => {
            if (a.assetId === t.fromAssetId) return { ...a, assetNumber: +(a.assetNumber + back).toFixed(2), updateTime: NOW() };
            if (a.assetId === t.toAssetId) return { ...a, assetNumber: +(a.assetNumber - toBack).toFixed(2), updateTime: NOW() };
            return a;
          }),
          tombstones: [...s.tombstones, { kind: "transfer", id: String(transferId), updatedAt: NOW() }]
        };
      }),
      // 登记报销：只落记录，钱还没到；确认到账时才进报销账户
      addReimbursement: ({ billId, assetId, number, detail }) => set((s) => {
        const rid = Date.now();
        const rec = {
          reimbursementId: rid,
          billId,
          assetId,
          number: Number(number) || 0,
          detail: detail ?? "",
          status: "pending",
          userId: s.userId,
          updateTime: NOW()
        };
        const bill = s.bills.find((b) => b.billId === billId);
        return {
          reimbursements: [rec, ...s.reimbursements],
          bills: bill ? s.bills.map((b) => b.billId === billId ? { ...b, isReimbursement: 1, reimbursementNum: rec.number, updateTime: NOW() } : b) : s.bills
        };
      }),
      settleReimbursement: (reimbursementId) => set((s) => {
        const rec = s.reimbursements.find((r) => r.reimbursementId === reimbursementId);
        if (!rec || rec.status === "done") return {};
        return {
          reimbursements: s.reimbursements.map((r) => r.reimbursementId === reimbursementId ? { ...r, status: "done", settledAt: NOW(), updateTime: NOW() } : r),
          assets: s.assets.map((a) => a.assetId === rec.assetId ? { ...a, assetNumber: +(a.assetNumber + rec.number).toFixed(2), updateTime: NOW() } : a)
        };
      }),
      deleteReimbursement: (reimbursementId) => set((s) => {
        const rec = s.reimbursements.find((r) => r.reimbursementId === reimbursementId);
        if (!rec) return {};
        const refundBack = rec.status === "done" ? rec.number : 0;
        return {
          reimbursements: s.reimbursements.filter((r) => r.reimbursementId !== reimbursementId),
          assets: refundBack ? s.assets.map((a) => a.assetId === rec.assetId ? { ...a, assetNumber: +(a.assetNumber - refundBack).toFixed(2), updateTime: NOW() } : a) : s.assets,
          bills: s.bills.map((b) => b.billId === rec.billId ? { ...b, isReimbursement: 0, reimbursementNum: 0, updateTime: NOW() } : b),
          tombstones: [...s.tombstones, { kind: "reimbursement", id: String(reimbursementId), updatedAt: NOW() }]
        };
      }),
      addCycle: (patch) => set((s) => ({
        cycles: [...s.cycles, {
          ...patch,
          cycleId: NOW(),
          enabled: patch.enabled ?? true,
          generated: [],
          userId: s.userId,
          updateTime: NOW()
        }]
      })),
      deleteCycle: (cycleId) => set((s) => ({
        cycles: s.cycles.filter((c) => c.cycleId !== cycleId),
        tombstones: [...s.tombstones, { kind: "cycle", id: String(cycleId), updatedAt: NOW() }]
      })),
      toggleCycle: (cycleId) => set((s) => ({
        cycles: s.cycles.map((c) => c.cycleId === cycleId ? { ...c, enabled: !c.enabled, updateTime: NOW() } : c)
      })),
      // 补生成所有到期未生成的周期账单；返回本次生成条数
      runCycles: () => {
        const s = get();
        const now = /* @__PURE__ */ new Date();
        const todayDay = now.getDate();
        const cy = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        let count = 0;
        const pending = s.cycles.filter((c) => c.enabled).map((c) => {
          const start = new Date(c.startTime);
          const gen = [];
          for (let d = new Date(start.getFullYear(), start.getMonth(), 1); ; d.setMonth(d.getMonth() + 1)) {
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            const isCurrent = key === cy;
            const due = isCurrent ? todayDay >= c.dayOfMonth : key < cy;
            if (due && !c.generated.includes(key) && !gen.includes(key)) gen.push(key);
            if (key >= cy) break;
          }
          return { c, gen };
        });
        const updated = [];
        for (const { c, gen } of pending) {
          for (const key of gen) {
            const [y, m] = key.split("-").map(Number);
            const time = new Date(y, m - 1, Math.min(c.dayOfMonth, 28), 9, 0, 0).getTime();
            const t = get();
            let billId = Math.floor(time / 1e3);
            while (t.bills.some((b) => b.billId === billId)) billId++;
            const parent = t.parentCategories.find((p) => p.id === c.parentCategoryId);
            const asset = t.assets.find((a) => a.assetId === c.assetId);
            const bill = {
              billId,
              time,
              cost: c.cost,
              parentCategoryId: c.parentCategoryId,
              childCategoryId: c.childCategoryId,
              assetId: c.assetId,
              bookId: t.currentBookId || 1,
              remark: c.remark || c.name,
              billType: 4,
              tags: [],
              files: [],
              userId: t.userId,
              updateTime: NOW(),
              billShareInfo: {
                parentCategoryName: parent?.name ?? "",
                childCategoryName: t.childCategories.find((x) => x.id === c.childCategoryId)?.name ?? "",
                assetName: asset?.assetName ?? ""
              }
            };
            const sign = parent?.kind === "income" ? 1 : -1;
            set((st) => ({
              bills: [bill, ...st.bills],
              assets: st.assets.map((a) => a.assetId === c.assetId ? { ...a, assetNumber: +(a.assetNumber + sign * c.cost).toFixed(2), updateTime: NOW() } : a)
            }));
            count++;
          }
          if (gen.length) updated.push({ ...c, generated: [...c.generated, ...gen], updateTime: NOW() });
        }
        if (updated.length) {
          const map = new Map(updated.map((u) => [u.cycleId, u]));
          set((st) => ({ cycles: st.cycles.map((c) => map.get(c.cycleId) ?? c) }));
        }
        return count;
      },
      // 借出 -、借入 +、收回 +、还款 -；删除则反向冲正
      addLend: ({ type, assetId, counterparty, number, time, remark }) => set((s) => {
        const amt = Number(number) || 0;
        if (amt <= 0 || !assetId) return {};
        const sign = type === 1 || type === 4 ? -1 : 1;
        const rec = {
          lendId: Date.now(),
          type,
          assetId,
          counterparty: counterparty ?? "",
          number: amt,
          time: time ?? NOW(),
          remark: remark ?? "",
          userId: s.userId,
          updateTime: NOW()
        };
        return {
          lends: [rec, ...s.lends],
          assets: s.assets.map((a) => a.assetId === assetId ? { ...a, assetNumber: +(a.assetNumber + sign * amt).toFixed(2), updateTime: NOW() } : a)
        };
      }),
      deleteLend: (lendId) => set((s) => {
        const rec = s.lends.find((x) => x.lendId === lendId);
        if (!rec) return {};
        const sign = rec.type === 1 || rec.type === 4 ? 1 : -1;
        return {
          lends: s.lends.filter((x) => x.lendId !== lendId),
          assets: s.assets.map((a) => a.assetId === rec.assetId ? { ...a, assetNumber: +(a.assetNumber + sign * rec.number).toFixed(2), updateTime: NOW() } : a),
          tombstones: [...s.tombstones, { kind: "lend", id: String(lendId), updatedAt: NOW() }]
        };
      }),
      // 退款：钱退回原支付账户，直接冲减这笔支出
      addRefund: ({ billId, number }) => set((s) => {
        const bill = s.bills.find((b) => b.billId === billId);
        if (!bill) return {};
        const amt = Number(number) || 0;
        if (amt <= 0) return {};
        const rec = {
          refundId: Date.now(),
          billId,
          number: amt,
          userId: s.userId,
          updateTime: NOW()
        };
        return {
          refunds: [rec, ...s.refunds],
          bills: s.bills.map((b) => b.billId === billId ? { ...b, refundNum: amt, updateTime: NOW() } : b),
          assets: s.assets.map((a) => a.assetId === bill.assetId ? { ...a, assetNumber: +(a.assetNumber + amt).toFixed(2), updateTime: NOW() } : a)
        };
      }),
      deleteRefund: (refundId) => set((s) => {
        const rec = s.refunds.find((r) => r.refundId === refundId);
        if (!rec) return {};
        const bill = s.bills.find((b) => b.billId === rec.billId);
        return {
          refunds: s.refunds.filter((r) => r.refundId !== refundId),
          tombstones: [...s.tombstones, { kind: "refund", id: String(refundId), updatedAt: NOW() }],
          bills: s.bills.map((b) => b.billId === rec.billId ? { ...b, refundNum: 0, updateTime: NOW() } : b),
          assets: bill ? s.assets.map((a) => a.assetId === bill.assetId ? { ...a, assetNumber: +(a.assetNumber - rec.number).toFixed(2), updateTime: NOW() } : a) : s.assets
        };
      }),
      setBudget: (budget) => set((s) => {
        const rest = s.budgets.filter((b) => !(b.month === budget.month && b.categoryId === budget.categoryId));
        return { budgets: budget.amount > 0 ? [...rest, budget] : rest };
      }),
      removeBudget: (month, categoryId) => set((s) => ({
        budgets: s.budgets.filter((b) => !(b.month === month && b.categoryId === categoryId)),
        tombstones: [...s.tombstones, { kind: "budget", id: `${month}:${categoryId}`, updatedAt: NOW() }]
      })),
      updateAsset: (asset) => set((s) => ({
        assets: s.assets.map((a) => a.assetId === asset.assetId ? { ...asset, updateTime: NOW() } : a)
      })),
      setBook: (id) => set({ currentBookId: id }),
      seed: () => {
        const assets = [
          { assetId: 1, assetName: "\u62DB\u884C\u50A8\u84C4\u5361", assetType: 1, assetNumber: 12500.5, groupName: "\u94F6\u884C\u5361", hide: false, intoTotalAsset: true, positionWeight: 0, remark: "", userId: 1, updateTime: NOW() },
          { assetId: 2, assetName: "\u62DB\u884C\u4FE1\u7528\u5361", assetType: 2, assetNumber: -2380, groupName: "\u4FE1\u7528\u5361", hide: false, intoTotalAsset: true, positionWeight: 1, remark: "", userId: 1, updateTime: NOW() },
          { assetId: 3, assetName: "\u652F\u4ED8\u5B9D", assetType: 1, assetNumber: 860.2, groupName: "\u7535\u5B50\u94B1\u5305", hide: false, intoTotalAsset: true, positionWeight: 2, remark: "", userId: 1, updateTime: NOW() }
        ];
        set({ assets, bills: [], seeded: true });
        const day = 864e5;
        const mk = (daysAgo, cost, pid, cid, aid, remark) => get().addBill({
          time: NOW() - daysAgo * day,
          cost,
          parentCategoryId: pid,
          childCategoryId: cid,
          assetId: aid,
          remark,
          billType: 2
        });
        mk(0, 32.5, 7, 706, 3, "\u5348\u996D");
        mk(0, 128, 8, 811, 1, "\u6D17\u8863\u6DB2\u548C\u7EB8\u5DFE");
        mk(1, 6, 6, 605, 3, "\u5730\u94C1");
        mk(2, 45, 3, 301, 1, "\u4E00\u672C\u4E66");
        mk(3, 3200, 4, 402, 1, "\u623F\u79DF");
        mk(4, 12e3, 903, 0, 1, "\u6708\u85AA");
      },
      reset: () => set({
        assets: [],
        bills: [],
        transfers: [],
        budgets: [],
        reimbursements: [],
        refunds: [],
        lends: [],
        cycles: [],
        seeded: false,
        parentCategories: [...TAXONOMY_PARENTS, ...TAXONOMY_INCOME],
        childCategories: TAXONOMY_CHILDREN
      }),
      exportAll: () => {
        const s = get();
        return {
          version: 1,
          exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
          accountBooks: s.accountBooks,
          assets: s.assets,
          bills: s.bills,
          transfers: s.transfers,
          budgets: s.budgets,
          reimbursements: s.reimbursements,
          refunds: s.refunds,
          lends: s.lends,
          cycles: s.cycles,
          parentCategories: s.parentCategories,
          childCategories: s.childCategories
        };
      },
      setLastSync: (t) => set({ lastSync: t }),
      setCurrencyRate: (code, rate) => set((s) => {
        const r = Number(rate);
        if (!Number.isFinite(r) || r <= 0) return {};
        return {
          currencies: s.currencies.map((c) => c.code === code ? { ...c, rate: c.code === s.defaultCurrency ? 1 : r } : c)
        };
      }),
      addCurrency: (c) => set((s) => s.currencies.some((x) => x.code === c.code) ? {} : { currencies: [...s.currencies, c] }),
      removeCurrency: (code) => set((s) => code === s.defaultCurrency ? {} : { currencies: s.currencies.filter((c) => c.code !== code) }),
      tombstone: (kind, id) => set((s) => ({
        tombstones: [
          ...s.tombstones.filter((t) => !(t.kind === kind && t.id === String(id))),
          { kind, id: String(id), updatedAt: NOW() }
        ]
      })),
      // 合并云端记录：逐条 last-write-wins，删除墓碑生效
      applyRemote: (records) => set((s) => {
        const next = {};
        const tombstones = [...s.tombstones];
        const spec = {
          bill: ["bills", "billId"],
          asset: ["assets", "assetId"],
          transfer: ["transfers", "transferId"],
          lend: ["lends", "lendId"],
          cycle: ["cycles", "cycleId"],
          parent: ["parentCategories", "id"],
          child: ["childCategories", "id"],
          book: ["accountBooks", "accountBookId"],
          reimbursement: ["reimbursements", "reimbursementId"],
          refund: ["refunds", "refundId"],
          budget: ["budgets", "month"]
        };
        const idOf = (kind, item) => kind === "budget" ? `${item.month}:${item.categoryId}` : String(item[spec[kind][1]]);
        for (const r of records || []) {
          const k = spec[r.kind];
          if (!k) continue;
          const arr = next[k[0]] ?? [...s[k[0]] || []];
          if (r.deleted) {
            next[k[0]] = arr.filter((x) => idOf(r.kind, x) !== String(r.id));
            if (!tombstones.some((t) => t.kind === r.kind && t.id === String(r.id))) {
              tombstones.push({ kind: r.kind, id: String(r.id), updatedAt: r.updatedAt || NOW() });
            }
            continue;
          }
          if (!r.payload) continue;
          const idx = arr.findIndex((x) => idOf(r.kind, x) === String(r.id));
          const localTime = idx >= 0 ? arr[idx].updateTime ?? 0 : -1;
          if (idx < 0 || (r.updatedAt ?? 0) > localTime) {
            if (idx >= 0) arr[idx] = r.payload;
            else arr.push(r.payload);
          }
          next[k[0]] = arr;
        }
        return { ...next, tombstones };
      }),
      // 补齐内置分类（缺失的加上），并把老数据里的 emoji 图标迁移成图标键
      mergeTaxonomy: () => set((s) => {
        const DEFAULT_RATE = { CNY: 1, USD: 7.2, EUR: 7.8, JPY: 0.048, HKD: 0.92 };
        const currencies = (s.currencies ?? []).map((c) => !c.rate || c.rate <= 0 ? { ...c, rate: DEFAULT_RATE[c.code] ?? 1 } : c);
        const key = (c) => `${c.parentId}|${c.name}|${c.kind}`;
        const haveP = new Set(s.parentCategories.map(key));
        const haveC = new Set(s.childCategories.map(key));
        const addP = [...TAXONOMY_PARENTS, ...TAXONOMY_INCOME].filter((c) => !haveP.has(key(c)));
        const addC = TAXONOMY_CHILDREN.filter((c) => !haveC.has(key(c)));
        const byName = /* @__PURE__ */ new Map();
        for (const c of [...TAXONOMY_PARENTS, ...TAXONOMY_INCOME, ...TAXONOMY_CHILDREN]) {
          byName.set(`${c.name}|${c.kind}`, c);
        }
        const RENAMED = { "\u623F\u79DF\u8FD8\u8D37": "\u623F\u8D37" };
        const fix = (c) => {
          const renamed = RENAMED[c.name];
          if (renamed) c = { ...c, name: renamed };
          if (c.icon?.startsWith("ic_")) return c;
          const t = byName.get(`${c.name}|${c.kind}`);
          return t ? { ...c, icon: t.icon, color: t.color, bg: t.bg } : c;
        };
        let parents = s.parentCategories.map(fix);
        let children = s.childCategories.map(fix);
        const JUNK = /* @__PURE__ */ new Set(["\u901A\u8BAF", "\u4EBA\u60C5", "\u5916\u5356", "\u4E09\u9910", "\u96F6\u98DF\u996E\u6599", "\u836F\u54C1"]);
        const used = /* @__PURE__ */ new Set();
        for (const b of s.bills) {
          used.add(b.parentCategoryId);
          if (b.childCategoryId) used.add(b.childCategoryId);
        }
        children = children.filter((c) => !JUNK.has(c.name) || used.has(c.id));
        parents = parents.filter((c) => !JUNK.has(c.name) || used.has(c.id));
        const INCOME_MISPLACED = /* @__PURE__ */ new Set(["\u6148\u5584\u6350\u52A9", "\u7406\u8D22\u652F\u51FA", "\u7F5A\u6B3E\u8D54\u507F"]);
        parents = parents.filter((c) => !(c.kind === "income" && INCOME_MISPLACED.has(c.name) && !used.has(c.id)));
        const ratesFixed = currencies.some((c, i) => c !== (s.currencies ?? [])[i]);
        if (!addP.length && !addC.length) {
          const changed = parents.some((c, i) => c !== s.parentCategories[i]) || children.some((c, i) => c !== s.childCategories[i]);
          if (!changed && !ratesFixed) return {};
          return { parentCategories: parents, childCategories: children, ...ratesFixed ? { currencies } : {} };
        }
        return {
          parentCategories: [...parents, ...addP],
          childCategories: [...children, ...addC],
          ...ratesFixed ? { currencies } : {}
        };
      }),
      // 合并式导入：新增分类/账户先落地，账单像正常记账一样冲账户余额
      applyImport: (plan) => set((s) => {
        const parents = [...s.parentCategories, ...plan.newParents];
        let assets = [...s.assets, ...plan.newAssets];
        const delta = (assetId, value) => {
          assets = assets.map((a) => a.assetId === assetId ? { ...a, assetNumber: +(a.assetNumber + value).toFixed(2), updateTime: NOW() } : a);
        };
        for (const b of plan.bills) {
          const kind = parents.find((p) => p.id === b.parentCategoryId)?.kind;
          delta(b.assetId, (kind === "income" ? 1 : -1) * b.cost);
        }
        for (const t of plan.transfers) {
          delta(t.fromAssetId, -(t.cost + t.serviceCharge));
          delta(t.toAssetId, t.cost);
        }
        return {
          parentCategories: parents,
          childCategories: [...s.childCategories, ...plan.newChildren],
          accountBooks: [...s.accountBooks, ...plan.newBooks],
          assets,
          bills: [...plan.bills, ...s.bills],
          transfers: [...plan.transfers, ...s.transfers],
          reimbursements: [...plan.reimbursements, ...s.reimbursements],
          refunds: [...plan.refunds, ...s.refunds],
          seeded: true
        };
      }),
      importAll: (data) => set((s) => ({
        accountBooks: data.accountBooks ?? s.accountBooks,
        assets: data.assets ?? [],
        bills: data.bills ?? [],
        transfers: data.transfers ?? [],
        budgets: data.budgets ?? [],
        reimbursements: data.reimbursements ?? [],
        refunds: data.refunds ?? [],
        lends: data.lends ?? [],
        cycles: data.cycles ?? [],
        parentCategories: data.parentCategories ?? s.parentCategories,
        childCategories: data.childCategories ?? s.childCategories,
        seeded: true
      }))
    }),
    { name: "xiaoman-data", storage: createJSONStorage(() => userStorage) }
  )
);
var useTotalAssets = () => useLedger((s) => {
  const rateOf = (code) => {
    if (!code || code === s.defaultCurrency) return 1;
    const c = s.currencies.find((x) => x.code === code);
    return c && c.rate ? c.rate : 1;
  };
  return s.assets.filter((a) => !a.hide && a.intoTotalAsset).reduce((sum, a) => sum + a.assetNumber * rateOf(a.currency), 0);
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  useLedger,
  useTotalAssets
});
/*! Bundled license information:

react/cjs/react.production.min.js:
  (**
   * @license React
   * react.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react/cjs/react.development.js:
  (**
   * @license React
   * react.development.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

use-sync-external-store/cjs/use-sync-external-store-shim.production.js:
  (**
   * @license React
   * use-sync-external-store-shim.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

use-sync-external-store/cjs/use-sync-external-store-shim.development.js:
  (**
   * @license React
   * use-sync-external-store-shim.development.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

use-sync-external-store/cjs/use-sync-external-store-shim/with-selector.production.js:
  (**
   * @license React
   * use-sync-external-store-shim/with-selector.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

use-sync-external-store/cjs/use-sync-external-store-shim/with-selector.development.js:
  (**
   * @license React
   * use-sync-external-store-shim/with-selector.development.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
