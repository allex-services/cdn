  CdnService.prototype._downloadAndPrepare= function () {
    if (this._building) {
      console.log('ALREADY IN BUILD PROCESS ...');
      return;
    }
    this._building = true;
    if (this.state.get('repo')) {
      console.log('going for Pb ... Removing ',this.path);
      Fs.removeSync(this.path);

      Heleprs.QReduce([
        Git.clone.bind(Git,this.state.get('repo'), this.path, null),
        Git.setBranch.bind(Git,this.state.get('branch'), this.path, null),
        this._readLastCommitID.bind(this),
        this._readEntryPoint.bind(this),
        this._generatePb.bind(this),
        this._finished.bind(this)
      ]);
    }else{
      Heleprs.QReduce([
        this._readEntryPoint.bind(this),
        this._generatePb.bind(this),
        this._finished.bind(this)
      ]);
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
    this._phase = (this._phase+1)%2;
    console.log("It's time to try to generate pb ...");
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

  CdnService.prototype._pbFaild = function (app_path, appname, err) {
    console.trace();
    console.log('Application %s failed on %s, due to %s', appname, app_path, err.error.message, err.stdout);
  };

