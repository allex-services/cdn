function createCdnService(execlib,ParentServicePack){
  var ParentService = ParentServicePack.Service;

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
    console.log('SAMO DA TE VIDIM ...');
  };
  
  return CdnService;
}

module.exports = createCdnService;
