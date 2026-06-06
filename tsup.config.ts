import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
    'response/index': 'src/response/index.ts',
    'logger/index': 'src/logger/index.ts',
    'redis/index': 'src/redis/index.ts',
    'database/index': 'src/database/index.ts',
    'http/index': 'src/http/index.ts',
    'events/index': 'src/events/index.ts',
    'metrics/index': 'src/metrics/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: [
    // peerDependencies — 번들에 포함하지 않음
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
