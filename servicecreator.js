///TODO: think about it: how to serve multiple web app suites using root dir ...
///TODO: think about sniffing interval reconfiguration ...

function createCdnService(execlib,ParentServicePack){
  var ParentService = ParentServicePack.Service,
  Path = require('path'),
  lib = execlib.lib
  Q = lib.q,
  Suite = execlib.execSuite,
  Taskregistry = Suite.taskRegistry,
  Toolbox = require('allex-toolbox'),
  Git = Toolbox.git,
  ChildProcess = require('child_process'),
  Node = Toolbox.node,
  StaticServer = require('node-static'),
  Fs = Toolbox.node.Fs;

  var SNIFFING_INTERVAL = 4*60*60*1000,
    DEFAULT_WEBAPP_SUITE = 'web_app',
    DEFAULT_EXTERNAL_PORT = 80,
    DEFAULT_BRANCH = 'master',
    DEFAULT_PROTOCOL = 'http';

  function factoryCreator(parentFactory){
    return {
      'service': require('./users/serviceusercreator')(execlib,parentFactory.get('service')),
      'user': require('./users/usercreator')(execlib,parentFactory.get('user')) 
    };
  }

  function CdnService(prophash){
    ParentService.call(this,prophash);
    this.path = prophash.path;
    var webapp_suite = prophash.webapp_suite || DEFAULT_WEBAPP_SUITE;
    this._serverMonitorPath = Path.resolve(this.path, webapp_suite, '_monitor');
    this._phase = 0;
    this._interval = null;

    this.server = null;
    this.ns = null;

    this.state.set('commit_id', null);
    this.state.set('webapp_suite', webapp_suite);
    this.state.set('repo', prophash.repo);
    this.state.set('sniffing_interval',prophash.sniffing_interval || SNIFFING_INTERVAL);
    this.state.set('port', prophash.port || DEFAULT_EXTERNAL_PORT);
    this.state.set('protocol', prophash.protocol || DEFAULT_PROTOCOL);
    this.state.set('branch', prophash.branch || DEFAULT_BRANCH);
  }
  ParentService.inherit(CdnService,factoryCreator);
  CdnService.prototype.__cleanUp = function(){
    this.stop();
    if (this._interval) clearInterval(this._interval);
    this._interval = null;
    this.path = null;
    this._phase = null;
    this._serverMonitorPath = null;
    ParentService.prototype.__cleanUp.call(this);
  };

  CdnService.prototype.onSuperSink = function (supersink) {
    if (this.state.get('repo')) {
      try {
        Fs.recreateDir(this.path);
      }catch (e) {
        defer.reject(e);
      }
      Git.clone (this.state.get('repo'), this.path).done(this._onCloneDone.bind(this));
    }else{
      this._onContainerReady();
    }
  };

  CdnService.prototype._onContainerReady = function () {
    this._generatePb()
      .then(this._initSniffer.bind(this), this._pbFaild.bind(this))
      .done (this.start.bind(this, this.state.get('port')));
  };

  CdnService.prototype._readCommitId = function () {
    Git.getLastCommitID(this.path)
      .then(this._onGotCommitId.bind(this), this._onCommitIdFaild.bind(this))
      .done(this._onContainerReady.bind(this));
  };
  CdnService.prototype._onGotCommitId = function (s) {
    this.state.set('commit_id', s.stdout.trim());
  };
  CdnService.prototype._onCommitIdFaild = function () {
    console.log('Commit id failed', arguments);
  };

  CdnService.prototype._onCloneDone = function () {
    Git.setBranch(this.state.get('branch'), this.path).done (this._readCommitId.bind(this));
  };
  CdnService.prototype._pbFaild = function (err) {
    console.log('WebApp build failed: ', err.stdout.toString());
  };

  CdnService.prototype._initSniffer = function () {
    this._interval = setInterval (this.update.bind(this),this.state.get('sniffing_interval'));
    console.log('CDN sniffer set to', this.state.get('sniffing_interval'));
  };

  CdnService.prototype._generatePb = function () {
    var ret = Q.defer();
    var cwd = Path.resolve(this.path, this.state.get('webapp_suite'));
    if (!Fs.dirExists (cwd)) {
      ret.reject('Invalid path: '+cwd);
      return ret.promise;
    }
    Node.executeCommand('allex-webapp-build', null, {cwd: cwd})
      .done (this._onBuildDone.bind(this, cwd, ret), ret.reject.bind(ret));
    return ret.promise;
  };

  CdnService.prototype._onBuildDone = function (cwd, defer) {
    var td = '_monitor_'+this._phase;
    Node.executeCommand('rm -rf '+td+' && mv _generated '+td, null, {cwd: cwd})
      .done(this._onWebAppReady.bind(this, td, defer, cwd), defer.reject.bind(defer));
    this._phase = (this._phase+1)%2;
  };

  CdnService.prototype._onWebAppReady = function (phase_dir, defer, cwd) {
    var _monitor_path = Path.resolve(cwd, '_monitor');
    if (Fs.dirExists(_monitor_path)) {
      Fs.unlinkSync(_monitor_path);
    }
    Fs.symlinkSync(Path.resolve(cwd, phase_dir), _monitor_path);
    defer.resolve();
  };

  CdnService.prototype.update = function () {
    //TODO
  };

  CdnService.prototype._serve = function (request, response) {
    request.addListener('end', this.ns.serve.bind(this.ns, request, response)).resume();
  };

  CdnService.prototype.restart = function (port) {
    this.stop(this.start.bind(this, port));
  };

  CdnService.prototype.start = function (port) {
    //TODO: what about certificate paths and so on ....
    //TODO
    if (this.ns) throw Error('Already running?');
    var proto = this.state.get('protocol');
    if (proto !== 'http' && this.proto !== 'htts') throw Error('Invalid protocol '+proto);
    console.log('Time to start listening: ',port, proto);
    this.ns = new StaticServer.Server(this._serverMonitorPath);
    this.server = require(proto).createServer(this._serve.bind(this));
    this.server.on ('error', this._onServerError.bind(this));
    this.server.listen({port:port}, this.state.set.bind(this.state, 'port', port));
  };

  CdnService.prototype._onServerError = function () {
    console.log('Server failed due to ',arguments);
    this.state.remove('port');
  };

  CdnService.prototype.stop = function (donecb) {
    console.log('ABOUT TO STOP ...');
    if (this.server) {
      this.server.close(donecb);
      this.server = null;
    }
    //is this sufficient?
    this.ns = null;
  };
  
  return CdnService;
}

module.exports = createCdnService;
