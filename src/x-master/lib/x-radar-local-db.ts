import type { D1DatabaseLike, D1StatementLike } from './x-automation-store.ts';
import type { SQLInputValue } from 'node:sqlite';

/** Node-only fallback for the local app. Hosted builds use their existing D1 binding. */
export async function openLocalRadarDatabase(path: string): Promise<D1DatabaseLike> {
  const { DatabaseSync } = await import('node:sqlite');
  const database = new DatabaseSync(path);
  database.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  let tail: Promise<unknown> = Promise.resolve();
  function statement(sql: string, values: SQLInputValue[] = []): D1StatementLike {
    return {
      bind: (...next) => statement(sql,next as SQLInputValue[]),
      first: async <T>() => (database.prepare(sql).get(...values) ?? null) as T | null,
      all: async <T>() => ({results:database.prepare(sql).all(...values) as T[]}),
      run: async () => { const prepared=database.prepare(sql); return prepared.columns().length ? {results:prepared.all(...values)} : {meta:{changes:Number(prepared.run(...values).changes)}}; },
    };
  }
  return {prepare:statement,batch:statements=>{
    const task=tail.then(async()=>{
      database.exec('BEGIN IMMEDIATE');
      try {const results=[];for(const item of statements)results.push(await item.run());database.exec('COMMIT');return results;}
      catch(error){database.exec('ROLLBACK');throw error;}
    });
    tail=task.catch(()=>undefined);return task;
  }};
}
