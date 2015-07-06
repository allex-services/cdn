function createServicePack(execlib){
  var lib = execlib.lib,
    q = lib.q,
    d = q.defer(),
    execSuite = execlib.execSuite;

  execSuite.registry.register('allex_directoryservice').done(
    realCreator.bind(null,d),
    d.reject.bind(d)
  );

  function realCreator(defer, ParentServicePack) {
    defer.resolve({
      Service: require('./servicecreator')(execlib,ParentServicePack),
      SinkMap: require('./sinkmapcreator')(execlib,ParentServicePack),
      Tasks: [{name: 'CdnWSBuildTask', klass: require('./tasks/cdnwsbuild_creator.js')(execlib)}]
    });
  }

  return d.promise;
}

module.exports = createServicePack;
