function createCdnServiceTester(execlib,Tester){
  var lib = execlib.lib,
      q = lib.q;

  function CdnServiceTester(prophash,client){
    Tester.call(this,prophash,client);
    console.log('runNext finish');
    lib.runNext(this.finish.bind(this,0));
  }
  lib.inherit(CdnServiceTester,Tester);

  return CdnServiceTester;
}

module.exports = createCdnServiceTester;
