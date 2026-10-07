import { test, expect } from '@playwright/test';

test('HTML nonces protect a hydrated app and block injected scripts and event handlers', async ({ page, request }) => {
  const first=await request.get('/'), second=await request.get('/');
  const policy=first.headers()['content-security-policy'];
  expect(policy).toContain("'strict-dynamic'");
  expect(policy).not.toContain("'unsafe-eval'");
  expect(policy).not.toEqual(second.headers()['content-security-policy']);
  const nonce=policy.match(/'nonce-([^']+)'/)![1];
  expect(await first.text()).toContain(`nonce="${nonce}"`);
  await page.goto('/');
  await expect(page.getByRole('button',{name:/Créer avec.*IA/}).first()).toBeVisible();
  expect(await page.evaluate(async()=>{
    const url=URL.createObjectURL(new Blob(['local PDF source']));
    try{return await (await fetch(url)).text();}finally{URL.revokeObjectURL(url);}
  })).toBe('local PDF source');
  const injected=await page.evaluate(async()=>{
    const target=window as typeof window & { securityProbe?:number };target.securityProbe=0;
    // Parser-inserted untrusted HTML is the injection vector. Scripts appended
    // by already trusted JavaScript are intentionally allowed by strict-dynamic.
    const frame=document.createElement('iframe');
    frame.srcdoc='<script>parent.securityProbe=99</script>';
    document.body.append(frame);
    const button=document.createElement('button');button.setAttribute('onclick','window.securityProbe=100');document.body.append(button);button.click();
    await new Promise(resolve=>setTimeout(resolve,100));frame.remove();button.remove();return target.securityProbe;
  });
  expect(injected).toBe(0);
});

test('voice API requests without a session are denied before processing content', async ({ request }) => {
  for(const endpoint of ['ai/parse','ai/parse-strict','ai/command','ai/agenda','copilot/proposal','transcribe']) {
    const response=await request.post(`/api/${endpoint}`,{data:{transcript:'Test sans session'},headers:{'x-forwarded-for':`security-${endpoint}`}});
    expect(response.status(),endpoint).toBe(401);
    expect(response.headers()['cache-control']).toContain('no-store');
  }
});
