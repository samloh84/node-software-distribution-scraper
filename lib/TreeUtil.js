const _ = require('lodash');

var TreeUtil = {};

TreeUtil.walk = function (options) {

    var tree = _.get(options, 'tree');
    var callback = _.get(options, 'callback');

    var visit = function (object, path) {
        if (_.isNil(path)) {
            path = [];
        }

        callback(object, path.join('.'));

        if (_.isPlainObject(object) || _.isArray(object)) {
            _.each(object, function (subobject, key) {
                visit(subobject, _.concat(path, key));
            });
        }
    };
};

module.exports = TreeUtil;