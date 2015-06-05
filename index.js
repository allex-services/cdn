function createServicePack(execlib){
  var execSuite = execlib.execSuite,
  DirectoryServicePack = execSuite.registry.register('allex_directoryservice'),
  ParentServicePack = DirectoryServicePack;

  return {
    Service: require('./servicecreator')(execlib,ParentServicePack),
    SinkMap: require('./sinkmapcreator')(execlib,ParentServicePack)
  };
}

module.exports = createServicePack;
