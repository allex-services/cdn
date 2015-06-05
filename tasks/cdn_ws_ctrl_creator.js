module.exports = function (execlib) {
  console.log('===>', arguments);
  var lib = execlib.lib, q = lib.q, execSuite = execlib.execSuite, SinkTask = execlib.SinkTask;

  function CdnWsCtrlTask (prophash) {
    SinkTask.call(this, prophash);
    console.log('ETO GA ...',prophash);
  }
  lib.inherit(CdnWsCtrlTask, SinkTask);
  CdnWsCtrlTask.prototype.__cleanUp = function () {
    SinkTask.prototype.__cleanUp.call(this);
  };


  CdnWsCtrlTask.prototype.go = function () {
    console.log('GO?');
  };
  CdnWsCtrlTask.prototype.compulsoryConstructionProperties = ['sink', 'command'];
  return CdnWsCtrlTask;
};
