var Toolbox = require('allex-toolbox'),
  Webalizer = Toolbox.webalizer,
  Integrator = Webalizer.PBWebApp.Integrator,
  Reader = Webalizer.PBWebApp.Reader,
  Path = require('path'),
  Node = Toolbox.node,
  WebAppTools = Webalizer.WebAppTools,
  Heleprs = Toolbox.helpers,
  Allex = Toolbox.allex,
  ModuleInstall = require('./ModuleInstall'),
  AppBuilder = require('./AppBuilder');

function WebAppSuiteBuilder (path, connection_data, phase) {
  this.connection_data = connection_data;
  this.path = path;
  this.apps = WebAppTools.findWebApps(this.path);
  this._instances = {};
  this._defer = Q.defer();
  this._m_installers = {};
  this.web_apps_ready = [];
  this.phase = phase;
}

WebAppSuiteBuilder.prototype.destroy = function () {
  ///TODO: not fully done ...
  this.connection_data = null;
  this.path = null;
  Lib.arryNullAll(this.apps);
  this.apps = null;
  Lib.objDestroyAll(this._instances);
  this._instances = null;
  this._defer = null;
  Lib.objDestroyAll(this._m_installers);
  this._m_installers = null;
  Lib.arryNullAll(this.web_apps_ready);
  this.web_apps_ready = null;
  this.phase = null;
};

WebAppSuiteBuilder.prototype._req_a_module = function (app, name) {
  //TODO: install will throw an error if there is no way to install a module ...
  if (!this._m_installers[name]){
    this._m_installers[name] = new ModuleInstall(this, name, app);
  }else{
    this._m_installers[name].add_app(app);
  }
};

WebAppSuiteBuilder.prototype.require_modules = function (modules, app) {
  modules.forEach(this._req_a_module.bind(this, app.name));
};


WebAppSuiteBuilder.prototype.go = function () {
  var to_reduce = [
    Node.executeCommand.bind(null, 'allex-bower-install', null, {cwd:this.path}, true)
  ];
  Array.prototype.push.apply(to_reduce, this.apps.map(this._prepareAppInstall.bind(this)));
  to_reduce.push (this._app_install_prep_done.bind(this));
  Q.allSettled(this.web_apps_ready).done(this._buildProtoboards.bind(this));
  Heleprs.QReduce(to_reduce);
  return this._defer.promise;
};

function appendProtoboard (pp, record) {
  if (pp.indexOf(record.path) > -1) return;
  pp.push(record.path);
}

WebAppSuiteBuilder.prototype._get_protoboard_paths = function(pp, instance, name) {
  instance.reader.getProtoboards().forEach(appendProtoboard.bind(null, pp));
};

WebAppSuiteBuilder.prototype._buildProtoboards = function () {
  Node.info('Components quest just ended, will build protoboard components');
  var protoboard_paths = [];
  Lib.traverse(this._instances, this._get_protoboard_paths.bind(this, protoboard_paths));
  Q.allSettled(protoboard_paths.map(build_component))
    .then(this._analyzePbBuildResult.bind(this));
};

WebAppSuiteBuilder.prototype._analyzePbBuildResult = function (results){
  ///TODO: sta ako je neki fail-ovao? !!!
  Node.info("ProtoBoard component building done");
  this.doBuild();
};

WebAppSuiteBuilder.prototype.doBuild = function () {
  var promisses = [];
  Lib.traverse(this._instances, this._do_build.bind(this, promisses));
  Q.allSettled (promisses)
    .done(this._buildingDone.bind(this));
};

WebAppSuiteBuilder.prototype._buildingDone = function (results) {
  Node.info('Apps building done ...');
  results.forEach(this._analyzeAppBuildingResults.bind(this));
  var _apps_dir = Path.join(this.path, '_apps');

  if (!Fs.dirExists(_apps_dir)) {
    Fs.mkdirSync(_apps_dir);
  }
  this.apps.forEach (this._linkApps.bind(this, _apps_dir));
  Node.info('Components located and built, web apps built, symlinks created ... Did everything I could ...');
  this._defer.resolve();
};

WebAppSuiteBuilder.prototype._linkApps = function (apps_dir, app) {
  var l = Path.join(apps_dir, app);
  if (Fs.existsSync(l)) {
    var stat = Fs.statSync(l);
    if (!stat.isSymbolicLink()) {
      ///nothing to be done ...
      return;
    }
    if (!Fs.existsSync(Fs.readlinkSync(l))) Fs.removeSync(l);
  }
  if (!Fs.existsSync(l)){ ///could be removed a line earlier before ...
    Fs.symlinkSync(Path.join(this.path, app, '_app'), Path.join(apps_dir, app));
  }
};


WebAppSuiteBuilder.prototype._analyzeAppBuildingResults = function (rec) {
  console.log(JSON.stringify(rec, null, 2));
  //TODO: what if there is an error ..
};

WebAppSuiteBuilder.prototype._do_build = function (promisses, instance, name) {
  Node.info('App ', name, 'building started');
  var app_dir = Path.resolve(this.path, name),
    commands = [],
    phase_dir = this.phase === null ? null : Path.join(app_dir, '_phase_'+this.phase);

  if (instance.reader.requires_connection) {
    commands.push('allex-webapp-build -c \''+JSON.stringify(this.connection_data)+'\'');
  }else{
    commands.push('allex-webapp-build');
  }

  if (phase_dir) {
    if (Fs.existsSync(phase_dir)) commands.push ('rm -rf '+phase_dir);
    commands.push('mv _generated '+phase_dir);
  }

  if (Fs.fileExists(Path.join(app_dir, '_app'))) {
    commands.push('rm _app');
  }
  commands.push('ln -s '+ (phase_dir ? phase_dir : '_generated') +' _app');
  promisses.push (Node.executeCommand(commands.join(' && '), null, {cwd:app_dir}));
};

function build_component (path) {
  return Node.executeCommand('allex-component-build', null, {cwd: path});
};

WebAppSuiteBuilder.prototype._app_install_prep_done = function () {
  var d = Q.defer();
  return d.promise;
};

WebAppSuiteBuilder.prototype._prepareAppInstall = function (appname) {
  var instance = new AppBuilder(this, appname);
  this.web_apps_ready.push (instance.componentsReady());
  this._instances[appname] = instance;
  instance.install();
  return instance.completed.bind(instance);
};

WebAppSuiteBuilder.prototype.build_web_apps = function () {
  var d = Q.defer();
  return d.promise;
};

WebAppSuiteBuilder.prototype.getApp = function (appname) {
  if (!appname) throw new Error("No appname? How to hell do you thing I'm gonna find instance?");
  return this._instances[appname];
};

module.exports = WebAppSuiteBuilder;
