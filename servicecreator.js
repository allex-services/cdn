function createCdnService(execlib,ParentServicePack){
  var ParentService = ParentServicePack.Service,
  Suite = execlib.execSuite,
  Taskregistry = Suite.taskRegistry;

  function factoryCreator(parentFactory){
    return {
      'service': require('./users/serviceusercreator')(execlib,parentFactory.get('service')),
      'user': require('./users/usercreator')(execlib,parentFactory.get('user')) 
    };
  }

  function CdnService(prophash){
    ParentService.call(this,prophash);
  }
  ParentService.inherit(CdnService,factoryCreator);
  CdnService.prototype.__cleanUp = function(){
    ParentService.prototype.__cleanUp.call(this);
  };

  CdnService.prototype.onSuperSink = function (supersink, defer) {
    /*
    console.log('SAMO DA TE VIDIM ...', arguments);
    var taskhash = {
      sink: supersink,
      command:'bla'
    };
    Taskregistry.run ('cdn_ws_ctrl', taskhash);
    */
    /*

    supersink.call('start').done(function ()  {
      console.log('AAAAAAAAAAAAA', arguments);
    }, function () {
      console.log('bbbbbbbbbb', arguments);
    });
    */
    ///defer.resolve(); ///ovo pukne ... kaze da nema defer-a ...
  };
  
  return CdnService;
}

module.exports = createCdnService;
