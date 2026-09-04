/**
 * 统一命名空间 + 依赖注入容器
 * ============================================================
 * 解决原生 JS 多模块下的三大痛点：
 *   1. 命名空间冲突   —— 所有模块收敛到 window.WB 单一命名空间
 *   2. 状态分散       —— 模块以 WB.define 注册，依赖显式声明
 *   3. 测试困难       —— 依赖经 WB.get(name) 解析，可替换注入
 * ============================================================
 * 用法：
 *   // 定义模块（deps 必须是已完成 WB.define 的模块名）
 *   WB.define('Topics', ['Db', 'AiGateway'], (Db, AiGateway) => ({ ... }));
 *   // 定义无依赖模块
 *   WB.define('utils', () => ({ escapeHtml, formatDate }));
 *   // 获取模块实例（懒初始化，重复调用返回同一单例）
 *   const Db = WB.get('Db');
 *
 * 本容器兼容任意 script 标签加载顺序；依赖在首次 get 时才实例化，
 * 只要 define 均已执行即可按任意顺序调用 get。
 */
(function (global) {
  const registry = {};   // name -> { deps, factory, instance }
  const constructing = new Set(); // 正在构造中的模块名（用于循环依赖检测）

  // 惰性代理：解析期间目标尚未就绪时返回，访问时转发到最终实例
  function createLazyProxy(name) {
    const handler = {
      get: (_, prop) => {
        if (prop === "_wbLazy") return true;
        const inst = WB.get(name);
        return Reflect.get(inst, prop);
      },
      set: (_, prop, val) => {
        const inst = WB.get(name);
        return Reflect.set(inst, prop, val);
      },
      has: (_, prop) => {
        const inst = WB.get(name);
        return prop in inst;
      },
      apply: (_, t, args) => WB.get(name)(...args),
      construct: (_, args) => new (WB.get(name))(...args),
    };
    return new Proxy(function () {}, handler);
  }

  const WB = {
    _registry: registry,

    /**
     * 注册模块
     * @param {string} name 模块名（命名空间 key）
     * @param {string[]} deps 依赖模块名数组；若省略则视为无依赖
     * @param {function} factory 工厂：(...depInstances) => instance
     * @returns {object} WB（支持链式）
     */
    define(name, deps, factory) {
      if (typeof deps === "function") {
        factory = deps;
        deps = [];
      }
      if (registry[name]) {
        throw new Error(`[WB] 模块重复注册: ${name}`);
      }
      registry[name] = {
        deps: deps || [],
        factory,
        instance: null,
      };
      return WB;
    },

    /**
     * 获取模块实例（懒加载单例）
     * - 若解析过程中遇到尚未构造完成的模块（循环依赖），返回惰性代理，
     *   该代理会在首次访问时转发到最终实例；由于模块间的互相调用均发生在
     *   运行期方法内部，而非工厂构造期，因此惰性代理安全可用。
     * @param {string} name 模块名
     * @returns {*} 模块实例
     */
    get(name) {
      const reg = registry[name];
      if (!reg) {
        throw new Error(`[WB] 模块未注册: ${name}`);
      }
      if (reg.instance) return reg.instance;
      // 构造中模块集合：用于检测循环依赖
      if (constructing.has(name)) {
        return createLazyProxy(name);
      }
      constructing.add(name);
      try {
        const depInstances = reg.deps.map((d) => {
          if (constructing.has(d)) return createLazyProxy(d);
          return WB.get(d);
        });
        reg.instance = reg.factory(...depInstances);
        reg._resolved = true;
        return reg.instance;
      } finally {
        constructing.delete(name);
      }
    },

    /**
     * 是否已注册
     * @param {string} name 模块名
     * @returns {boolean}
     */
    has(name) {
      return !!registry[name];
    },
  };

  // 唯一全局出口：window.WB
  global.WB = WB;
})(window);