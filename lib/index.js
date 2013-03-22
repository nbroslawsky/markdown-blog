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
	this.title = undefined;
	this.directory = undefined;
	this.pages = {};
}

var postProcessors = {
		imgsrc : function(html) {
			return html.replace(/(<img .*?src=)(['"])(.*?)(\3)/igm, "$1$2{ROOT_PATH}/$3$4");
		},
		href : function(html) {
			return html.replace(/(<a .*?href=)(['"])(?!https?:\/\/)(.*?)(\3)/igm, "$1$2{ROOT_PATH}/$3$4");
		}
	},
	postProcessorKeys = Object.keys(postProcessors),
	postProcessorSigs = (function() {
		var i=0;
		return postProcessorKeys.reduce(function(init, key) {
			init[key] = 1 << i;
			return init;
		}, {});
	})(),
	getFunctionsToRun = function(sig) {
		if(!sig) { return []; }
		return postProcessorKeys
			.filter(function(key) {
				return postProcessorSigs[key] & sig == postProcessorSigs[key];
			})
			.map(function(key) {
				return postProcessors[key];
			});
	};




Blog.prototype = {
	setTitle : function(title) { this.title = title; },
	setDirectory : function(directory) {

		this.directory = directory;

		var pages = this.pages;
		Object.keys(pages).forEach(function(pageKey) {
			pages[pageKey].absUrl = path.join('/', directory, pageKey);
		});
	},
	replacePlaceholders : function(nvMap) {

		var regexes = {};
		for(var name in nvMap) {
			regexes[name] = new RegExp('{'+name+'}',"mig");
		}

		var self = this;
		Object.keys(this.pages).forEach(function(pageKey) {
			var page = self.pages[pageKey];
			for(var name in nvMap) {
				page.html = page.html.replace(regexes[name],nvMap[name]);
			}
			regexes[name].lastIndex = 0;
		});

		return this;
	},
	compile : function(postProcessorSig, done) {

		if(postProcessorSig instanceof Function) {
			done = postProcessorSig;
			postProcessorSig = 0;
		}

		var post = getFunctionsToRun(postProcessorSig);

		var self = this;
		fs.readdir(this.path, function(err, items) {

			if(err) { return done.call(self, err); }

			async.parallel(

				items.reduce(function(init, item) {
					init[item] = function(cb) {
						fs.stat(path.join(self.path, item), cb);
					};
					return init;

				}, {}),
				function(err, results) {
					if(err) { return done.call(self, err); }

					async.parallel(
						Object.keys(results)
							.filter(function(file) {
								return results[file].isFile() && (path.extname(file) == '.md');
							})
							.sort(function(a,b) {
								return results[a].ctime < results[b].ctime;
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

							self.pages = Object.keys(htmls).reduce(function(init, file) {

								var ext = path.extname(file),
									strippedFilename = file.substr(0,file.length-ext.length),
									url = sanitizeUrl(strippedFilename);

								init[url] = {
									title : strippedFilename,
									url : url,
									absUrl : self.directory ? path.join('/', self.directory, url) : undefined,
									html : post.reduce(function(html, func) { return func(html); }, htmls[file]),
									fileData : {
										modified : results[file].mtime,
										created : results[file].ctime
									}
								};

								return init;
							},{});

							return done.call(self, null, self);
						}
					);
				}
			);
		});
	}
};


exports.MarkdownBlog = Blog;
exports.compile = function(path, sig, cb) {
	if(sig instanceof Function) {
		cb = sig;
		sig = 0;
	}
	var b = new Blog(path);
		b.compile(sig, cb);
};

exports.sanitizeUrl = sanitizeUrl;
exports.PostProcessors = postProcessorSigs;