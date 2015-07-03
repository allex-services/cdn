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
  console.log('DA LI SI UNISTIO INTEGRATOR ?', this.integrator);
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

//TODO: sad ti fali trenutak kad dodjes i kazes OK: 1. skinuo sam allex_service, napravio default komponente izbildao protoboarde, sad reader treba da rezolvuje asset-e i nakon toga ja treba da kazem allex-weball-build !!!

function ModuleInstall (suite, module_name, interestedapp) {
  this.interested_apps = [];
  this.add_app(interestedapp);
  this.state = 'pending';
  this.suite = suite;
  this.module_name = module_name;
  //go for it right away ...
  this.install();
}

ModuleInstall.prototype.destroy = function () {
  this.suite = null;
  this.state = null;
  Lib.arryNullAll(this.interested_apps);
  this.interested_apps = null;
  this.module_name = null;
};

ModuleInstall.prototype.add_app = function (app) {
  if (!app) return;
  if (this.interested_apps.indexOf(app) < 0) {
    this.interested_apps.push(app);
  }
};

ModuleInstall.prototype.install = function () {
  this.state = 'installing';
  if (!Allex.recognize(this.module_name)) {
    throw new Error('Unable to install non allex module, revisit configuration');
  }
  console.log('WILL INSTALL ALLEX MODULE ...', process.cwd());
  Allex.commands.install(this._done.bind(this), this.module_name, process.cwd());
};

ModuleInstall.prototype._done = function () {
  Node.info (this.module_name, 'installed ... Will notify ', this.interested_apps);
  this.state = 'done';
  this.interested_apps.forEach(this._notify_app.bind(this));
};

ModuleInstall.prototype._notify_app = function (app) {
  this.suite.getApp(app).integrate_module(this.module_name);
};


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
  var l = Path.join(app_dir, app);
  if (Fs.existsSync(l)) {
    var stat = Fs.statSync(l);
    if (!stat.isSymbolicLink()) throw new Error ('This should never happen ... Not a symlink?');
    if (!Fs.existsSync(Fs.readlinkSync(l))) Fs.removeSync(l);
  }
  if (!Fs.existsSync){ ///could be removed a line earlier before ...
    Fs.symlinkSync(Path.join(this.path, app, '_monitor'), Path.join(apps_dir, app));
  }
};


WebAppSuiteBuilder.prototype._analyzeAppBuildingResults = function (rec) {
  //TODO: what if there is an error ..
};

WebAppSuiteBuilder.prototype._do_build = function (promisses, instance, name) {
  ///TODO: STIGAO SI DO OVDE: fali ti uslovni rm _monitor && mv _generated _stage_num && ln -s _stage_num _monitor
  Node.info('App ', name, 'building started');
  var app_dir = Path.resolve(this.path, name),
    commands = ['allex-webapp-build'],
    phase_dir = Path.join(app_dir, '_phase_'+this.phase);

  if (Fs.existsSync(phase_dir)) commands.push ('rm -rf '+phase_dir);
  commands.push('mv _generated '+phase_dir);
  if (Fs.fileExists(Path.join(app_dir, '_app'))) {
    commands.push('rm _app');
  }
  commands.push('ln -s '+phase_dir+' _app');
  //promisses.push (Node.executeCommand(commands.join(' && '), null, {cwd:app_dir}));
  console.log('STA CU SAD DA RADIM ',commands.join(' && '), this.phase, phase_dir);
};

function build_component (path) {
  return Node.executeCommand('allex-component-build', null, {cwd: path});
};

WebAppSuiteBuilder.prototype._app_install_prep_done = function () {
  var d = Q.defer();
  this._defer.resolve();
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
