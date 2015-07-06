var Toolbox = require('allex-toolbox'),
  Webalizer = Toolbox.webalizer,
  Integrator = Webalizer.PBWebApp.Integrator,
  Reader = Webalizer.PBWebApp.Reader,
  Path = require('path'),
  Node = Toolbox.node,
  WebAppTools = Webalizer.WebAppTools,
  Heleprs = Toolbox.helpers,
  Allex = Toolbox.allex;

function ModuleInstall (suite, module_name, interestedapp) {
  this.interested_apps = [];
  this.add_app(interestedapp);
  this.state = 'pending';
  this.suite = suite;
  this.module_name = module_name;
  //go for it right away ...
  this.install();
}

ModuleInstall.prototype.destroy = function () {
  this.suite = null;
  this.state = null;
  Lib.arryNullAll(this.interested_apps);
  this.interested_apps = null;
  this.module_name = null;
};

ModuleInstall.prototype.add_app = function (app) {
  if (!app) return;
  if (this.interested_apps.indexOf(app) < 0) {
    this.interested_apps.push(app);
  }
};

ModuleInstall.prototype.install = function () {
  this.state = 'installing';
  if (!Allex.recognize(this.module_name)) {
    throw new Error('Unable to install non allex module, revisit configuration');
  }
  console.log('WILL INSTALL ALLEX MODULE ...', process.cwd());
  Allex.commands.install(this._done.bind(this), this.module_name, process.cwd());
};

ModuleInstall.prototype._done = function () {
  Node.info (this.module_name, 'installed ... Will notify ', this.interested_apps);
  this.state = 'done';
  this.interested_apps.forEach(this._notify_app.bind(this));
};

ModuleInstall.prototype._notify_app = function (app) {
  this.suite.getApp(app).integrate_module(this.module_name);
};

module.exports = ModuleInstall;
