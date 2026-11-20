// What the studio knows about the site at build time.
import config from 'virtual:yoakari/config';
import info from 'virtual:yoakari/studio';

if (!config.studio) throw new Error('yoakari: the studio page was built without the `studio` option');

export const site = config;
export const studio = config.studio;
export const buildInfo = info;
export const [owner, repoName] = studio.repo.split('/') as [string, string];

/** A path inside the site folder → its path inside the repository. */
export const repoPath = (p: string) => [studio.root, p].filter(Boolean).join('/');
export const postsDir = repoPath(studio.posts);
export const configPath = info.configFile ? repoPath(info.configFile) : null;
