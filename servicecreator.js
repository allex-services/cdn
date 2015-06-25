///TODO: think about it: how to serve multiple web app suites using root dir ...
///TODO: think about sniffing interval reconfiguration ...

var Toolbox = require('allex-toolbox'),
  ChildProcess = require('child_process'),
  Webalizer = Toolbox.webalizer,
  Node = Toolbox.node,
  Watcher = require('node-watch'),
  ModuleCache = require('allex_module_cache'),
  Path = require('path');

function createCdnService(execlib,ParentServicePack){
  var ParentService = ParentServicePack.Service,
  lib = execlib.lib
  Q = lib.q,
  Suite = execlib.execSuite,
  Taskregistry = Suite.taskRegistry,
  Git = Toolbox.git,
  Fs = Toolbox.node.Fs;

  var DEFAULT_BRANCH = 'master',
    DEFAULT_WEB_COMPONENT_DIR = 'web_component';

  function factoryCreator(parentFactory){
    return {
      'service': require('./users/serviceusercreator')(execlib,parentFactory.get('service')),
      'user': require('./users/usercreator')(execlib,parentFactory.get('user')) 
    };
  }
 
  function CdnService(prophash){
    ///TODO: nemas bas jasne kriterijume kad dolazis na /index.html kad na /some_app/index.html
    ParentService.call(this,prophash);
    this.path = Path.resolve(prophash.path);
    this.commanded_web_app_suite = prophash.webapp_suite || null;

    this.state.set('missing', prophash.waitforcomponents || null);
    this.state.set('repo', prophash.repo || null);
    this.state.set('branch', prophash.branch || DEFAULT_BRANCH);
    this.state.set('root', null);

    this._phase = 0;
    this._building = false;
    this._rebuild = false;

    this.module_names = [];
    this.modules = {};
  }
  ParentService.inherit(CdnService,factoryCreator);
  CdnService.prototype.__cleanUp = function(){
    this._building = null;
    this._rebuild = null;
    if (this.commanded_web_app_suite) lib.arryNullAll(this.commanded_web_app_suite);
    this.commanded_web_app_suite = null;
    lib.arryNullAll (this.module_names);
    lib.objNullAll(this.modules);
    this.module_names = null;
    this.path = null;
    ParentService.prototype.__cleanUp.call(this);
  };

  CdnService.prototype.onSuperSink = function (supersink) {
    Taskregistry.run('findSink', {'masterpid':global.ALLEX_PROCESS_DESCRIPTOR.get('masterpid'),'sinkname': 'LanManager', 'identity': {'name': 'user', 'role':'user'}, 'onSink': this._onLMSink.bind(this)});
    if (!this.state.get('missing')) {
      this._goForPb();
    }
  };

  CdnService.prototype._goForPb = function () {
    if (this._building) {
      console.log('ALREADY IN BUILD PROCESS ...');
      return;
    }
    this._building = true;
    if (this.state.get('repo')) {
      console.log('going for Pb ... Removing ',this.path);
      Fs.removeSync(this.path);

      [
        Git.clone.bind(Git,this.state.get('repo'), this.path, null),
        Git.setBranch.bind(Git,this.state.get('branch'), this.path, null),
        this._readLastCommitID.bind(this),
        this._readEntryPoint.bind(this),
        this._generatePb.bind(this),
        this._finished.bind(this)
      ].reduce (this._reduction.bind(this), Q(null));
    }else{
        [
          this._generatePb.bind(this),
          this._finished.bind(this)
        ].reduce(this._reduction.bind(this) ,Q(null));
    }
  };

  CdnService.prototype._reduction = function (soFar, f, index) {
    return soFar.then(f, this._onError.bind(this));
  };

  CdnService.prototype._onGotPort = function (address, defer, port){
    Fs.writeJsonSync(Path.resolve(this.path, 'connection_setup.json'), {
      ipaddress: address,
      httpport: port
    });
    defer.resolve(); ///ok, sho must go on ...
  };

  CdnService.prototype._onEPSink = function (defer, sinkinfo) {
    if (!sinkinfo.sink){
      return;
    }
    console.log('Got new EntryPoint data, address %s httpport %d', sinkinfo.ipaddress, sinkinfo.httpport);
    Taskregistry.run ('readState', {
      state:Taskregistry.run('materializeState', {sink:sinkinfo.sink}),
      name:'port',
      cb : this._onGotPort.bind(this, sinkinfo.ipaddress, defer)
    });
  };

  CdnService.prototype._readEntryPoint = function () {
    var d = Q.defer();
    Taskregistry.run('findAndRun', {
      program: {
        sinkname: 'EntryPoint',
        identity: {name:'user', role:'user'},
        task: {
          name: this._onEPSink.bind(this, d),
          propertyhash: {
            ipaddress:'fill yourself',
            httpport:'fill yourself'
          }
        }
      }
    });
    return d.promise;
  };


  CdnService.prototype._onLMSink = function (lmsink) {
    if (!lmsink) return;
    var state = Taskregistry.run('materializeState', {'sink': lmsink});
    console.log('acquireSubSinks to engaged_modules ...');
    Taskregistry.run ('acquireSubSinks', {
      'state': state, 
      'subinits': [
        {'name':'engaged_modules','identity': {'name':'user', 'role':'user'},'cb': this._onEngagedModulesSink.bind(this)}
      ],
    });
  };

  CdnService.prototype._onEngagedModulesSink = function (sink) {
    if (!sink) return;
    Taskregistry.run('materializeData', {
      'sink':sink, 
      'data': this.module_names,
      'onInitiated':this._onLMModulesReady.bind(this),
      'onNewRecord':this._onLMModulesRecord.bind(this),
    });
  };

  CdnService.prototype._resolveModules = function () {
    this.module_names.forEach (this._resolveModule.bind(this));
  };

  CdnService.prototype._onLMModulesReady = function () {
    ///data will be put into this.module_names ...
    this._resolveModules();
  };

  CdnService.prototype._onLMModulesRecord = function (record) {
    this.module_names.push(record);
    this._resolveModules();
  };

  CdnService.prototype._resolveModule = function (item) {
    ///seems good to me ...
    ///find a module and execute allex-component-build ... once done, call _removeMissingComponent
    if (!item || !item.modulename) return;
    var name, data = {};

    if (Path.isAbsolute(item.modulename)) {
      name = Path.resolve(item.modulename).split(Path.sep).pop();
      if (this.modules[name]){
        ///TODO: neka provera nesto?
        return;
      }
      data.path = item.modulename;
    }else{
      var r = ModuleCache.recognizeAllex(item.modulename);
      if (!r) {
        name = item.modulename;
        data.path = Path.dirname(require.resolve(item.modulename));
      }else{
        name = r.servicename;
        data.path = Path.dirname(require.resolve(item.modulename));
      }
    }

    var web_c = Path.resolve(data.path, DEFAULT_WEB_COMPONENT_DIR);
    if (Fs.dirExists(web_c)) {
      data.web_component = web_c;
    }

    ///TODO
    ///THIS IS HUGE MISTAKE !!!! now services are allowed not to have web_component dir ...
    ///consider refering or so for known modules on allex-webapp-build
    this.modules[name] = data;
    if (data.web_component) {
      data.promise = Node.executeCommand('allex-component-build', null, {cwd: web_c}, true);
      data.promise.done (this._removeMissingComponent.bind(this, name, true), this._onError.bind(this));
    }else{
      this._removeMissingComponent(name, false);
    }
  };

  CdnService.prototype._removeMissingComponent = function (name, installed) {
    //seems fine to me ...
    console.log('_removeMissingComponent', name, installed);
    var missing = this.state.get('missing');
    if (!missing) return;

    missing = missing.split(',');
    var index = missing.indexOf(name);
    if (index < 0) return;
    if (!installed) {
      throw new Error("Seems to me we're having some problems, "+name+" was required, but not installed?");
      ///STA SAD? ovo nikad nece dobiti web componentu, a trazeno je ... ubiti skota ...
    }
    missing.splice(index, 1);
    if (missing.length) {
      this.state.set('missing', missing.join(','));
    }else{
      this.state.set('missing', null);
      this._goForPb();
    }
  };

  CdnService.prototype._readLastCommitID = function () {
    var d = Q.defer();
    this.state.set('commit_id', Git.getLastCommitID(this.path));
    console.log('Got last commit id',this.state.set('commit_id'))
    d.resolve();
    return d.promise;
  };

  CdnService.prototype._build = function (appname) {
    var d = Q.defer();

    var app_path = Path.join(this.path, appname);
    var phase_path = Path.join(app_path, '_phase_'+this._phase);
    d.promise.then(this.log_s.bind(this, 'Allex webapp '+app_path+' built successfully'), this._pbFaild.bind(this, app_path, appname));

    var is_repo = this.state.get('repo');
    var command = '';
    if (is_repo) {
      if (Fs.dirExists(Path.resolve(app_path, phase_path))){
        command += ('rm -rf '+phase_path+' && ');
      }
      command+='echo `pwd` && allex-webapp-build && mv _generated '+phase_path+' && ln -fs '+phase_path+' _monitor';
    }else{
      command = 'allex-webapp-build';
    }

    this.apps[appname] = {
      generated: Path.resolve(app_path, is_repo ? '_monitor' : '_generated'),
    };

    Node.executeCommand(command, d, {cwd: app_path});
    return d.promise;
  };

  CdnService.prototype._generatePb = function () {
    var defer = Q.defer();
    lib.objNullAll(this.apps);
    this.apps = {};
    if (Toolbox.protoboard.webapp.isWebapp(this.path)) {
      this._build('./').done(this._onBuildDone.bind(this, defer));
    }else{
      var was = this.commanded_web_app_suite;

      if (!was) {
        was = Toolbox.protoboard.webapp.find(this.path);
      }else{
        was = was.split(',');
      }

      Q.allSettled(was.map(this._build.bind(this))).done(this._onBuildDone.bind(this, defer));
    }
    this._phase = (this._phase+1)%2;
    return defer.promise;
  };

  CdnService.prototype._finished = function () {
    var d = Q.defer();
    d.resolve();
    this._building = false;
    if (this._rebuild) {
      this._rebuild = false;
    }
    console.log('Webapps done ... ');
    var result_path = this.state.get('repo') ? '_monitor': '_generated';
    var apps = Object.keys(this.apps);


    if (apps.length === 1 && this.commanded_web_app_suite) {
      var a = apps[0];
      this.state.set('root', Path.resolve(this.path, apps[0], result_path));
    }else{
      Fs.recreateDir(Path.join(this.path,'_apps'));
      lib.traverse(this.apps, createAppLinks.bind(null, this.path));
      this.state.set('root', Path.resolve(this.path, '_apps'));
    }
    console.log('Webapp CDN root is ',this.state.get('root'));
    return d.promise;
  };

  function createAppLinks (root, value, name) {
    Fs.symlinkSync(value.generated, Path.join(root,'_apps', name));
  }

  CdnService.prototype._onBuildDone = function (defer,results) {
    //TODO: do some console.log regarding results ...
    defer.resolve();
  };

  CdnService.prototype._pbFaild = function (app_path, appname, err) {
    console.trace();
    console.log('Application %s failed on %s, due to %s', appname, app_path, err.error.message, err.stdout);
  };

  CdnService.prototype._onError = function () {
    Array.prototype.unshift.call(arguments, 'Error:');
    this.log.apply(this, arguments);
  };

  CdnService.prototype.log = function () {
    console.log.apply(console, arguments);
  };
  CdnService.prototype.log_s = function (s) {
    this.log(s);
  };
  
  return CdnService;
}

module.exports = createCdnService;
