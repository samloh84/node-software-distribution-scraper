const RequestUtil = require('@lohsy84/request-util');
const Promise = require('bluebird');
const _ = require('lodash');

var DockerhubOfficialRepoUtil = {};

DockerhubOfficialRepoUtil.getVersionsFromTags = function (repo) {


    var versions = [];
    return RequestUtil.request({
        url: sprintf('https://raw.githubusercontent.com/docker-library/official-images/master/library/%s', repo),
    })
        .then(function (response) {
            var regExp = /Tags:\s+(.+)/g;

            var tagLines = response.text.match(regExp);
            _.each(tagLines, function (tagLine) {
                var tags = tagLine.split(/,\s+/);

                _.each(tags, function (tag) {
                    var matches = /(\d+\.\d+\.\d+[a-zA-Z0-9]*)/.exec(tag);
                    if (!_.isNil(matches)) {
                        var version = matches[1];
                        versions.push(version);
                    }
                });
            });

            versions = _.uniq(versions);
            versions.sort();

            return versions;
        });
};

module.exports = DockerhubOfficialRepoUtil;