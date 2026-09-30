import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'./e2e', testMatch:'mascot.spec.ts', timeout:30000, workers:1,
 reporter:'list', use:{trace:'retain-on-failure'},
 projects:[{name:'desktop',use:{viewport:{width:1440,height:900}}},{name:'tablet',use:{viewport:{width:834,height:1194},hasTouch:true}},{name:'mobile',use:{viewport:{width:390,height:844},hasTouch:true}}],
});
