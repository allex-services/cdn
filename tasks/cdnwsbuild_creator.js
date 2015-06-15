module.exports = function (execlib) {
  var lib = execlib.lib, 
  q = lib.q, 
  execSuite = execlib.execSuite, 
  SinkTask = execSuite.SinkTask,
  ChildProcess = require('child_process'),
  Toolbox = require('allex-toolbox'),
  Fs = Toolbox.node.Fs;

  function CdnWSBuildTask (prophash) {
    SinkTask.call(this, prophash);
    this.path = prophash.path;
    this.repo = prophash.repo;
    this.cb = prophash.cb;
  }
  lib.inherit(CdnWSBuildTask, SinkTask);
  CdnWSBuildTask.prototype.__cleanUp = function () {
    this.repo = null;
    this.path = null;
    this.cb = null;
    SinkTask.prophash.__cleanUp.call(this);
  };


  CdnWSBuildTask.prototype.go = function () {
    //if there is a repo, work in double buffer regime ...
    if (this.repo) {
    }
    try {
      console.log('DA LI SE OVO DOGODILO?');
      ChildProcess.execSync('allex-webapp-build', {cwd: this.path});
    }catch (e) {
      console.log('NE MOZE DALJEEEEEEEEEEEEEEEEEEEEEEEEEE ...');
      ///sta sad?
    }
  };

  CdnWSBuildTask.prototype.compulsoryConstructionProperties = ['sink','repo', 'path', 'cb'];
  return CdnWSBuildTask;
};
