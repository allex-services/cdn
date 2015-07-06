//TODO: define and resolve restart and rebuild conditions ....

var Toolbox = require('allex-toolbox'),
  ChildProcess = require('child_process'),
  Webalizer = Toolbox.webalizer,
  Integrator = Webalizer.PBWebApp.Integrator,
  Reader = Webalizer.PBWebApp.Reader,
  Node = Toolbox.node,
  Watcher = require('node-watch'),
  Heleprs = Toolbox.helpers,
  Path = require('path'),
  WebAppSuiteBuilder = require('./src/');

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
    console.log('CdnService!',this);
    ParentService.call(this,prophash);
    this.path = Path.resolve(prophash.path);

    this.state.set('repo', prophash.repo || null);
    this.state.set('branch', prophash.branch || DEFAULT_BRANCH);
    this.state.set('root', null);

    this._phase = null;
    this._building = false;
    this._rebuild = false;
    this.modules = {};
    this.connection_data = null;
  }
  ParentService.inherit(CdnService,factoryCreator);
  CdnService.prototype.__cleanUp = function(){
    this._building = null;
    this._rebuild = null;
    this.connection_data = null;
    lib.objNullAll(this.modules);
    this.path = null;

    ParentService.prototype.__cleanUp.call(this);
  };

  //service maintenance methods ...
  CdnService.prototype.onSuperSink = function (supersink) {
    Taskregistry.run('findSink', {'masterpid':global.ALLEX_PROCESS_DESCRIPTOR.get('masterpid'),'sinkname': 'LanManager', 'identity': {'name': 'user', 'role':'user'}, 'onSink': this._onLMSink.bind(this)});
    ///there is nothing we can do until we get entrypoint ...
    this._readEntryPoint().done(this._downloadAndPrepare.bind(this));
  };

  CdnService.prototype._onEntryPointReady = function () {
    console.log('Entry point ready, ready to move on ...');
  };

  CdnService.prototype._onLMSink = function (lmsink) {
    if (!lmsink) return;
    var state = Taskregistry.run('materializeState', {'sink': lmsink});
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

  CdnService.prototype._onLMModulesReady = function () {
    ///data will be put into this.module_names ...
    if (!this.module_names) return;
    this.module_names.forEach (this._resolveModule.bind(this));
  };

  CdnService.prototype._onLMModulesRecord = function (record) {
    this.module_names.push(record);
    this._onLMModulesReady();
  };

  CdnService.prototype._resolveModule = function (item) {
    ///should give to integrator something to deal with ...
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

  CdnService.prototype._onEPSink = function (defer, sinkinfo) {
    console.log('ENTRY POINT ', sinkinfo);
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

  CdnService.prototype._onGotPort = function (address, defer, port){
    this.connection_data = {
      ipaddress: address,
      httpport: port
    };
    console.log('Got connection data ...', this.connection_data);
    defer.resolve(); ///ok, show must go on ...
  };


  CdnService.prototype._downloadAndPrepare = function () {
    if (this._building) {
      this._rebuild = true;
      return;
    }
    this._phase = (this._phase+1)%2;
    this._building = new WebAppSuiteBuilder(this.path, this.connection_data, this.state.get('repo') ? this._phase : null);
    this._rebuild = false;

    if (this.state.get('repo')) {
      console.log('Got repo record, will try to download project :', this.state.get('repo'));
      Fs.removeSync(this.path);
      Heleprs.QReduce([
        Git.clone.bind(Git, this.state.get('repo'), this.path, null),
        Git.setBranch.bind(Git, this.state.get('branch'), this.path, null),
        this._building.go.bind(this._building),
        this._finalize.bind(this)
      ]);
    }else{
      Heleprs.QReduce([
        this._building.go.bind(this._building),
        this._finalize.bind(this)
      ]);
    }
  };

  CdnService.prototype._finalize = function () {
    //TODO: check if everything is successfully destroyed
    var d = Q.defer();
    this._building.destroy();
    this._building = null;
    if (this._rebuild) {
      Lib.runNext (this._downloadAndPrepare.bind(this), 1);
    }
    d.resolve();
    return d.promise;
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
