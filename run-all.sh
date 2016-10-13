#!/usr/bin/env bash

node bin/java.js | tee output/java/java.log
node bin/java-postprocess.js | tee output/java/java-postprocess.log
node bin/jetbrains.js | tee output/jetbrains/jetbrains.log
node bin/jetty.js | tee output/jetty/jetty.log
node bin/jetty-postprocess.js | tee output/jetty/jetty-postprocess.log
node bin/jruby.js | tee output/jruby/jruby.log
node bin/nodejs.js | tee output/nodejs/nodejs.log
node bin/nodejs-postprocess.js | tee output/nodejs/nodejs-postprocess.log
node bin/php.js | tee output/php/php.log
node bin/php-postprocess.js | tee output/php/php-postprocess.log
node bin/python.js | tee output/python/python.log
node bin/python-postprocess.js | tee output/python/python-postprocess.log
node bin/ruby.js | tee output/ruby/ruby.log
node bin/ruby-postprocess.js | tee output/ruby/ruby-postprocess.log
