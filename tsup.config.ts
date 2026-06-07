import { defineConfig } from 'tsup'

const modules = ['response', 'logger', 'redis', 'database', 'http', 'events', 'metrics', 'versioning']

const frameworkEntries = modules.reduce(
  (acc, mod) => ({
    ...acc,
    [`${mod}/nestjs/index`]: `src/${mod}/nestjs/index.ts`,
    [`${mod}/fastify/index`]: `src/${mod}/fastify/index.ts`,
  }),
  {} as Record<string, string>,
)

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
    ...modules.reduce((acc, mod) => ({ ...acc, [`${mod}/index`]: `src/${mod}/index.ts` }), {}),
    ...frameworkEntries,
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: [
    '@nestjs/common',
    '@nestjs/core',
    'fastify',
    'fastify-plugin',
    'ioredis',
    'reflect-metadata',
    'rxjs',
    'typeorm',
  ],
})
