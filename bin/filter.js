
const _ = require('lodash');
const _path = require('path');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs-extra'));
const ScrapeUtil = require('../lib/ScrapeUtil');
const YAML = require('yamljs');

var filenameIndex = process.argv.indexOf(__filename);
if (filenameIndex === -1) {
    filenameIndex = process.argv.indexOf(path.relative(process.cwd(), __filename));
}

var args = process.argv.slice(filenameIndex + 1);

if (args.length < 2) {
    console.log("Usage: " + _path.basename(__filename) + " language filters");
    process.exit(1);
}

var language = args[0];
var filters = args.slice(1);
var file = require(_path.resolve(process.cwd(), 'output', language, language + '.json'));


filters = _.map(filters, function (filter) {
    return new RegExp(filter, 'i');
});

var items = [];
function visit(object, path) {
    if (_.isNil(path)) {
        path = [];
    }

    if (_.isPlainObject(object)) {
        _.each(object, function (subObject, key) {
            visit(subObject, _.concat(path, key));
        });
    } else {
        var _path = path.join('.');

        var filterPass = _.every(filters, function (filter) {
            return filter.test(_path);
        });
        if (filterPass) {
            items.push(object);
        }
    }
}

visit(file);

items.sort();


_.each(items, function (item) {
    console.log(item);
});

process.exit(0);
