var fs = require('fs');
var cache = {};
console.log("Cache loading");

/*fs.readFile("../cache.json", "utf8", function (err, data) {
    if (err) throw err;

    console.log("Cache ready");
    cache = JSON.parse(data);
});*/

module.exports = {
    cache: cache,
    setCache: setCache()
};

function setCache(newCache) {
    cache = newCache;

    fs.writeFile("../cache.json", JSON.stringify(cache), {
        encoding: "utf8"
    })
}