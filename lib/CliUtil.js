const Promise = require('bluebird');


var CliUtil = {};

CliUtil.execute = function (promise) {
    return Promise.resolve(promise)
        .then(function () {
            process.exit(0);
        })
        .catch(function (err) {
            console.error(err.stack || err);
            process.exit(1);
        })
};

module.exports = CliUtil;
