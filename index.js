import chalk from 'chalk';
import rc from 'rc';
import p from 'prompt-sync';
import {wire, state} from './lib.js';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const conf = rc(
    require('./package.json').name,
    {}
);
const prompt = p();

const w = wire(conf);
const currentState = state(w);

// screens
const selectRepo = async(state) => {
    console.log(chalk.white('Please select repo\n'));
    state.set('tree', await w.tree());
    const validAnswers = [];
    state.get('tree')
        .map(({name, tags, manifests, ...rest}, idx) => {
            if (tags && tags.length) {
                validAnswers.push(idx);
                console.log(chalk.green(`${idx + 1}. ${name}`));
            } else {
                console.log(chalk.red(`N/A. ${name}`));
            }
        });
    const ans = prompt('Repo number ? ');
    if (validAnswers.indexOf(parseInt(ans) - 1) > -1) {
        state.set('step', 'selectTag');
        state.set('selection', ans - 1);
    } else {
        state.set('step', 'selectRepo');
        state.set('selection', undefined);
    }
    recall(state);
};

const selectTag = async(state) => {
    const {
        name: repo,
        tags
    } = state.get('tree')[state.get('selection')];
    console.log(chalk.white(`Please select tag for repo: ${repo}\n`));
    const validAnswers = [];
    tags
        .map((tag, idx) => {
            console.log(chalk.green(`${idx + 1}. ${tag}`));
            validAnswers.push(idx);
        });
    const ans = prompt('Tag number ? ');
    if (validAnswers.indexOf(parseInt(ans) - 1) > -1) {
        state.set('step', 'manifests');
        state.set('selection', [state.get('selection'), ans - 1]);
    } else {
        state.set('step', 'selectTag');
    }
    recall(state);
};

const manifests = async(state) => {
    const [repoIdx, tagIdx] = state.get('selection');
    const {
        name: repo,
        tags,
        manifests
    } = state.get('tree')[repoIdx];
    console.log(chalk.white(`Manifest for: ${repo}:${tags[tagIdx]}\n`));
    const validAnswers = ['delete', 'home'];
    console.log(chalk.yellow(JSON.stringify(manifests[tagIdx].payload, null, 4)));
    const ans = prompt('what to do ? \n type delete (to delete the manifest) or home (to go to init screen)');
    if (validAnswers.indexOf(ans) > -1) {
        if (ans === 'delete') {
            await (w.manifests({
                repo,
                tag: tags[tagIdx],
                arch: 'amd64'
            })).delete();
        }
        state.set('step', 'selectRepo');
        state.set('selection', undefined);
    }
    recall(state);
};

const recall = async(state) => {
    try {
        if (!stateMap[state.get('step')]) {
            throw new Error('not.implemented');
        }
        await stateMap[state.get('step')](state);
    } catch (e) {
        console.error(e);
    }
};

const stateMap = {
    selectRepo,
    selectTag,
    manifests
};

(async() => {
    try {
        await recall(currentState);
    } catch (e) {
        console.error(e);
    }
})();
