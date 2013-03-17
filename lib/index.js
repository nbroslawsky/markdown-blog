var fs = require('fs'),
	path = require('path'),
	md = require('markdown-js'),
	async = require('async');

function sanitizeUrl(str, preserveCase) {
	var urlValue = str.replace(/^([^a-z])|[^a-z0-9_\-]/gi, '-$1');
	if(!preserveCase) urlValue = urlValue.replace(/([a-z0-9])([A-Z])/g,'$1-$2').toLowerCase();
	return urlValue;
}

function Blog(path) {
	this.path = path;
	this.pages = [];
}

Blog.prototype = {
	compile : function(done) {

		var self = this;
		fs.readdir(this.path, function(err, items) {

			if(err) { return done(err); }

			async.parallel(

				items.reduce(function(init, item) {
					init[item] = function(cb) {
						fs.stat(path.join(self.path, item), cb);
					};
					return init;

				}, {}),
				function(err, results) {
					if(err) { return done(err); }

					async.parallel(
						Object.keys(results)
							.filter(function(file) {
								return results[file].isFile() && (path.extname(file) == '.md');
							})
							.reduce(function(init, file) {

								init[file] = function(cb) {
									fs.readFile(path.join(self.path, file), 'utf-8', function(err, contents) {
										cb(err, !err && md.makeHtml(contents));
									});
								};

								return init;
							}, {}),
						function(err, htmls) {

							self.pages = Object.keys(htmls).map(function(file) {

								var ext = path.extname(file);
								return {
									url : sanitizeUrl(file.substr(0,file.length-ext.length)),
									html : htmls[file]
								};
							});

							return done(null, self);
						}
					);
				}
			);
		});
	}
};


exports.MarkdownBlog = Blog;
exports.compile = function(path, cb) {
	var b = new Blog(path);
		b.compile(cb);
};
