///TODO: think about it: how to serve multiple web app suites using root dir ...
///TODO: think about sniffing interval reconfiguration ...

var StaticServer = require('node-static'),
  Toolbox = require('allex-toolbox'),
  ChildProcess = require('child_process'),
  Watcher = require('node-watch');

function createCdnService(execlib,ParentServicePack){
  var ParentService = ParentServicePack.Service,
  Path = require('path'),
  lib = execlib.lib
  Q = lib.q,
  Suite = execlib.execSuite,
  Taskregistry = Suite.taskRegistry,
  Git = Toolbox.git,
  Node = Toolbox.node,
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
    this._serverMonitorPath = Path.resolve(this.path, webapp_suite, prophash.repo ? '_monitor' : '_generated');
    this._phase = 0;
    this._interval = null;

    this.server = null;
    this.ns = null;
    this.cwd = Path.resolve(this.path, webapp_suite);

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
    ///!!!!! TODO: revise this one ...
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
      [
        Git.clone.bind(Git,this.state.get('repo'), this.path, null),
        Git.setBranch.bind(Git,this.state.get('branch'), this.path, null),
        this._readLastCommitID.bind(this),
        this._generatePb.bind(this),
        this._move_generated.bind(this),
        this._linkPhase.bind(this),
        this._initSniffer.bind(this),
        this.start.bind(this, this.state.get('port'), null)
      ].reduce (this._reduction.bind(this), Q(null));
    }else{
        [
          this._generatePb.bind(this),
          this._initFsSniffer.bind(this),
          this.start.bind(this, this.state.get('port'), null)
        ].reduce(this._reduction.bind(this) ,Q(null));
    }
  };

  CdnService.prototype._onGotCommitId = function (s) {
    this.state.set('commit_id', s.stdout.trim());
  };

  CdnService.prototype._readLastCommitID = function () {
    return Git.getLastCommitID(this.path).then(this._onGotCommitId.bind(this)); //then will return promise and we're good ...
  };

  CdnService.prototype._reduction = function (soFar, f) {
    return soFar.then(f, this._onError.bind(this));
  };

  CdnService.prototype._initSniffer = function () {
    var d = Q.defer();
    this._interval = setInterval (this.update.bind(this),this.state.get('sniffing_interval'));
    this.log('CDN sniffer set to', this.state.get('sniffing_interval'));
    d.resolve();
    return d.promise;
  };

  CdnService.prototype._initFsSniffer = function () {
    var d = Q.defer();
    d.resolve();
    return d.promise;
  };

  CdnService.prototype._generatePb = function () {
    var ret = Q.defer();
    if (!Fs.dirExists (this.cwd)) {
      ret.reject('Invalid path: '+this.cwd);
      return ret.promise;
    }
    var cwd = this.cwd;
    this.log('Building allex webapp');
    ret.promise.then(this.log_s.bind(this, 'Allex webapp build successfully'));
    Node.executeCommand('allex-webapp-build', ret, {cwd: this.cwd});
    return ret.promise;
  };
  CdnService.prototype._move_generated = function () {
    var ret = Q.defer();
    var td = '_monitor_'+this._phase;
    ret.promise.done (this.log_s.bind(this, 'Moving _generated done ...'));
    Node.executeCommand('rm -rf '+td+' && mv _generated '+td, ret , {cwd: this.cwd});
    return ret.promise;
  };

  CdnService.prototype._linkPhase = function () {
    var defer = Q.defer();
    var phase_dir = '_monitor_'+this._phase;
    this._phase = (this._phase+1)%2;
    var _monitor_path = Path.resolve(this.cwd, '_monitor');
    if (Fs.dirExists(_monitor_path)) {
      Fs.unlinkSync(_monitor_path);
    }
    Fs.symlinkSync(Path.resolve(this.cwd, phase_dir), _monitor_path);
    defer.resolve();
    this.log('Link phase done');
    return defer.promise;
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

  CdnService.prototype.start = function (port, defer) {
    //TODO: what about certificate paths and so on ....
    if (!defer) defer = Q.defer();
    if (this.ns) throw Error('Already running?');
    var proto = this.state.get('protocol');
    if (proto !== 'http' && this.proto !== 'htts') throw Error('Invalid protocol '+proto);
    this.log('Time to start listening: ',port, proto);
    this.ns = new StaticServer.Server(this._serverMonitorPath);
    this.server = require(proto).createServer(this._serve.bind(this));
    this.server.on ('error', this._onServerError.bind(this, defer));
    this.server.listen({port:port}, this._onListening.bind(this, port, defer));
  };

  CdnService.prototype._onListening = function (port,defer) {
    this.state.set('port', port);
    defer.resolve();
  };

  CdnService.prototype._onError = function (err) {
    if (err instanceof Error) {
      this.log('An error occured',err.message, err.stack);
    }else{
      this.log('An error occured',err);
    }
    this.stop();
  };

  CdnService.prototype._onServerError = function (defer,err) {
    this.state.remove('port');
    defer.reject(err);
  };

  CdnService.prototype.stop = function (donecb) {
    this.log('ABOUT TO STOP ...');
    if (this.server) {
      this.server.close(donecb);
      this.server = null;
    }
    //is this sufficient?
    this.ns = null;
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
