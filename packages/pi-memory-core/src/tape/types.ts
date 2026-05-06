export type TapeContextStrategy = 'recent-only' | 'smart';

export interface TapeKeywordConfig {
  global?: string[];
  project?: string[];
}

export type TapeHandoffMode = 'auto' | 'manual';

export interface TapeConfig {
  enabled?: boolean;
  onlyGit?: boolean;
  excludeDirs?: string[];
  tapePath?: string;
  context?: {
    strategy?: TapeContextStrategy;
    fileLimit?: number;
    memoryScan?: [number, number];
    alwaysInclude?: string[];
    whitelist?: string[];
    blacklist?: string[];
  };
  anchor?: {
    labelPrefix?: string;
    mode?: TapeHandoffMode;
    keywords?: TapeKeywordConfig;
  };
}

export const defaultTapeConfig: Required<Pick<TapeConfig, 'context' | 'anchor'>> = {
  context: {
    strategy: 'smart',
    fileLimit: 10,
    memoryScan: [72, 168],
    alwaysInclude: [],
    whitelist: [],
    blacklist: [],
  },
  anchor: {
    labelPrefix: '⚓ ',
    mode: 'auto',
    keywords: {
      global: [],
      project: [],
    },
  },
};
