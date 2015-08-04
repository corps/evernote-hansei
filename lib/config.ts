import fs = require("fs");
import Promise = require("bluebird");

var readFile = Promise.promisify<string, string, string>(fs.readFile);
var writeFile = Promise.promisify<void, string, any>(fs.writeFile);

export class Config {
  authToken: string = "";
  notebookNames: string[] = [];
  targetNotebookGuid: string = "";
  digestSize: number = 5;

  constructor(public configFilePath: string) { }

  static load(configFilePath: string, opts: { [k: string]: string }) {
    var config = new Config(configFilePath);
    return readFile(configFilePath, "utf8").then((data) => {
      return JSON.parse(data);
    }).catch(() => { return {}; }).then((json) => {
      (<any>json).__proto__ = config;
      config = <Config>json;

      if (opts["authenticate"])
        config.authToken = opts["authenticate"];

      if (opts["notebooks"])
        config.notebookNames = opts["notebooks"].split(",");

      if (opts["digest"])
        config.digestSize = parseInt(opts["digest"], 10) || 5;

      return config.save();
    });
  }

  save() {
    return writeFile(this.configFilePath, JSON.stringify(this)).then(() => this);
  }
}
