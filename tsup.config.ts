import { defineConfig } from 'tsup'

const modules = [
  'response',
  'logger',
  'redis',
  'database',
  'http',
  'events',
  'metrics',
  'versioning',
  'health',
  'auth',
]

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
    // grpc는 fastify 변형이 없어 3-path 공통 modules 배열에 넣지 않고 개별 등록한다
    'grpc/index': 'src/grpc/index.ts',
    'grpc/nestjs/index': 'src/grpc/nestjs/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  external: [
    '@grpc/grpc-js',
    '@nestjs/common',
    '@nestjs/core',
    '@nestjs/microservices',
    'fastify',
    'fastify-plugin',
    'ioredis',
    'reflect-metadata',
    'rxjs',
    'typeorm',
  ],
})
