import http from 'node:http';
import url from 'node:url';
import https from 'node:https';

export function wire({
    registry: {
        endpoint,
        auth
    }
}) {
    const {
        protocol
    } = new url.URL(endpoint);
    const media = (protocol.startsWith('http:') &&
        http) || https;
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

export function state() {
    const s = {
        tree: [],
        step: 'selectRepo',
        selection: undefined
    };

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
        },
        set(key, value) {
            s[key] = value;
            return o.get(key);
        }
    };
    return o;
};
