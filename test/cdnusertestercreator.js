function createCdnUserTester(execlib,Tester){
  var lib = execlib.lib,
      q = lib.q;

  function CdnUserTester(prophash,client){
    Tester.call(this,prophash,client);
    console.log('runNext finish');
    lib.runNext(this.finish.bind(this,0));
  }
  lib.inherit(CdnUserTester,Tester);

  return CdnUserTester;
}

module.exports = createCdnUserTester;
