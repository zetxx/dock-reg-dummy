const url = require('url');
const conf = require('rc')(
    require('./package.json').name,
    {}
);

const wire = ({
    registry: {
        endpoint,
        auth
    }
}) => {
    const {
        protocol
    } = new url.URL(endpoint);
    const media = (protocol.startsWith('http:') &&
        require('http')) || require('https');
    const call = ({
        method,
        uri,
        headers = {}
    }) => new Promise((resolve, reject) => {
        const req = media
            .request(`${endpoint}${uri}`, {
                auth,
                method: method.toUpperCase(),
                headers
            }, (res) => {
                let data = Buffer.from([]);
                res.on('data', (d) =>
                    (data = Buffer.concat([data, d]))
                );
                res.on('error', (e) =>
                    reject(e)
                );
                res.on('end', () => {
                    const {errors, ...response} = (
                        data.length && JSON.parse(data.toString('utf8'))
                    ) || {};
                    if (errors) {
                        return reject(errors);
                    }
                    resolve({
                        payload: response,
                        headers: res.headers
                    });
                });
            });
        req.end();
    });

    const o = {
        catalog: async() => (await call({
            method: 'get',
            uri: '/v2/_catalog'
        })).payload,
        tags: (repo) => ({
            get: async() => (await call({
                method: 'get',
                uri: `/v2/${repo}/tags/list`
            })).payload,
            delete: async() => ({})
        }),
        manifests: ({repo, tag, arch}) => ({
            get: async({headers} = {}) => await call({
                method: 'get',
                uri: `/v2/${repo}/manifests/${tag}`,
                headers: headers || {
                    Accept: 'application/vnd.docker.distribution.manifest.v2+json'
                }
            }),
            delete: async() => {
                const {headers: {'docker-content-digest': digest}} = await o
                    .manifests({repo, tag})
                    .get();
                return await call({
                    method: 'delete',
                    uri: `/v2/${repo}/manifests/${digest}`
                });
            }
        }),
        blobs: ({repo, tag, arch} = {}) => ({
            delete: async() => ({}),
            get: async() => ({})
        }),
        tree: async() => await Promise.all(
            (await o.catalog())
                .repositories
                .map(async(repo) => {
                    const {tags, ...rest} = await o.tags(repo).get();
                    const manifests = tags && await Promise.all(tags.map(
                        async(tag) => await o.manifests({repo, tag}).get()
                    ));
                    return {
                        ...rest,
                        tags,
                        manifests
                    };
                })
        )
    };
    return o;
};
const state = () => {
    const s = {tree: []};

    const o = {
        init({
            tree
        }) {
            if (tree) {
                s.tree = tree;
            }
        },
        get(key) {
            return s[key];
        }
    };
    return o;
};
(async() => {
    try {
        const w = wire(conf);
        const currentState = state(w);
        currentState.init({tree: await w.tree()});
        currentState.get('tree')
            .map(({name, tags, manifests, ...rest}, idx) => {
                if (tags && tags.length) {
                    tags.map((tag) => console.log(`${idx + 1}. ${name}:${tag}`));
                } else {
                    console.log(`${idx + 1}. EMPTY ${name}`);
                }
            });
        // await (w.manifests({
        //     repo: 'impl-mfactor-demo',
        //     tag: 'latest-1',
        //     arch: 'amd64'
        // })).delete();
    } catch (e) {
        console.error(e);
    }

    // repo
    //     .map((r) => console.table(JSON.stringify(r, null, 4)));
})();
