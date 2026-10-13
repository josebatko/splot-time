import Database from 'better-sqlite3';
import { mkdirSync, chmodSync } from 'node:fs';
const source=process.env.DATABASE_PATH || '/data/splot-time.db';
const directory='/data/backups';
mkdirSync(directory,{recursive:true,mode:0o700});
const db=new Database(source,{readonly:true,fileMustExist:true});
const destination=`${directory}/splot-time-${new Date().toISOString().replaceAll(':','-')}.db`;
try {
  await db.backup(destination);
  chmodSync(destination,0o600);
  const copy=new Database(destination,{readonly:true,fileMustExist:true});
  try {if(copy.pragma('integrity_check',{simple:true})!=='ok') throw Error('Backup integrity check failed');}
  finally {copy.close();}
  console.log('SQLite backup integrity verified. Off-host recovery requires a separate copy.');
} finally {db.close();}
