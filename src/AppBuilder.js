var Toolbox = require('allex-toolbox'),
  Webalizer = Toolbox.webalizer,
  Integrator = Webalizer.PBWebApp.Integrator,
  Reader = Webalizer.PBWebApp.Reader,
  Path = require('path'),
  Node = Toolbox.node,
  WebAppTools = Webalizer.WebAppTools,
  Heleprs = Toolbox.helpers,
  Allex = Toolbox.allex;

function AppBuilder(suite, name) {
  this._completed = Q.defer();
  this._components_ready = Q.defer();
  this.path =  Path.resolve(suite.path, name);
  this.suite = suite;
  this.name = name;
  this.reader = null;
  this.integrator = null;
}

AppBuilder.prototype.destroy = function () {
  if (this.integrator) this.integrator.destroy();
  this.integrator = null;
  if (this.reader) this.reader.destroy();
  this.reader = null;
  this.name = null;
  this.suite = null;
  this.path = null;
  this._completed = null;
  this._components_ready = null;
};

AppBuilder.prototype.info = function () {
  Array.prototype.unshift.call(arguments, this.name+':');
  Node.info.apply(null, arguments);
};

AppBuilder.prototype.completed = function () {return this._completed.promise; };
AppBuilder.prototype.componentsReady = function () {return this._components_ready.promise; };

AppBuilder.prototype.install = function () {
  this.info ('Will install app bower components if any ...');
  Node.executeCommand('allex-bower-install', null, {cwd: this.path})
    .done(this._prepare_components.bind(this)); ///add some onError ...
};

AppBuilder.prototype._prepare_components = function () {
  this.info('Bower components install done, moving to app requirements analysis ...');
  this.reader = new Reader(this.path);
  this.integrator = new Integrator(this.reader);
  this.reader.set_connection_data(this.suite.connection_data);

  /// at this point reader should have all components resolved, both bower and allex ... fully synchronous process
  var unresolved = this.reader.getUnresolvedComponents();
  if (unresolved.length) {
    this.info('There is ', unresolved.length, 'unresolved components, will try to locate them locally ...');
    ///there are some unresolved components, should monitor ready ...
    this.suite.require_modules(unresolved, this);

    //sad bi suite trebao da nadje modul, da kaze integratory da je nasao i da ceka za dalje upute ;)
  }else{
    this._app_ready();
  }
};

AppBuilder.prototype._app_ready = function () {
  this.info('Requirements satisfied, should go on ...');
  this._components_ready.resolve();
};

AppBuilder.prototype.integrate_module = function (name){
  this.integrator.findModule(name);
  if (!this.reader.getUnresolvedComponents().length) this._app_ready();
};

module.exports = AppBuilder;
