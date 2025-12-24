import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'fs';

const isWatch = process.argv.includes('--watch');

const baseConfig = {
  bundle: true,
  minify: !isWatch,
  sourcemap: isWatch,
  target: 'es2022',
  format: 'esm',
};

const contexts = await Promise.all([
  esbuild.context({
    ...baseConfig,
    entryPoints: ['src/sw.ts'],
    outfile: 'dist/sw.js',
  }),
  esbuild.context({
    ...baseConfig,
    entryPoints: ['src/content.ts'],
    outfile: 'dist/content.js',
  }),
  esbuild.context({
    ...baseConfig,
    entryPoints: ['src/ui/rail.ts'],
    outfile: 'dist/rail.js',
  }),
]);

async function build() {
  try {
    mkdirSync('dist', { recursive: true });
    mkdirSync('icons', { recursive: true });

    await Promise.all(contexts.map(ctx => ctx.rebuild()));

    console.log('✓ Build complete');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

if (isWatch) {
  await Promise.all(contexts.map(ctx => ctx.watch()));
  console.log('👀 Watching for changes...');
} else {
  await build();
  await Promise.all(contexts.map(ctx => ctx.dispose()));
}
