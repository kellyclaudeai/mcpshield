/**
 * Unit tests for OSV API client
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import nock from 'nock';
import { OSVClient } from '../src/osv.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('OSVClient', () => {
  let client: OSVClient;
  
  beforeEach(() => {
    client = new OSVClient('https://api.osv.dev');
    nock.cleanAll();
  });
  
  afterEach(() => {
    nock.cleanAll();
  });

  describe('queryBatch', () => {
    it('should query vulnerabilities for multiple packages', async () => {
      // Load fixture
      const fixture = JSON.parse(
        await fs.readFile(
          path.join(__dirname, 'fixtures/osv/batch-response.json'),
          'utf-8'
        )
      );
      
      // Mock OSV API
      nock('https://api.osv.dev')
        .post('/v1/querybatch')
        .reply(200, fixture);
      
      const result = await client.queryBatch({
        queries: [
          {
            package: { name: 'lodash', ecosystem: 'npm' },
            version: '4.17.20',
          },
          {
            package: { name: 'express', ecosystem: 'npm' },
            version: '4.18.0',
          },
        ],
      });
      
      assert.strictEqual(result.results.length, 2);
      assert.strictEqual(result.results[0].vulns?.length, 1);
      assert.strictEqual(result.results[0].vulns?.[0].id, 'GHSA-x5rq-j2xg-h7qm');
      assert.strictEqual(result.results[1].vulns?.length, 0);
    });
    
    it('should handle API errors', async () => {
      nock('https://api.osv.dev')
        .post('/v1/querybatch')
        .reply(500, { error: 'Internal server error' });
      
      await assert.rejects(
        async () => {
          await client.queryBatch({
            queries: [{ package: { name: 'test', ecosystem: 'npm' } }],
          });
        },
        (error: Error) => {
          assert.match(error.message, /OSV batch query failed/);
          return true;
        }
      );
    });
  });

  describe('getVulnerability', () => {
    it('should fetch vulnerability details by ID', async () => {
      const vulnFixture = JSON.parse(
        await fs.readFile(
          path.join(__dirname, 'fixtures/osv/lodash-4.17.20-vulns.json'),
          'utf-8'
        )
      );
      
      nock('https://api.osv.dev')
        .get('/v1/vulns/GHSA-x5rq-j2xg-h7qm')
        .reply(200, vulnFixture.vulns[0]);
      
      const result = await client.getVulnerability('GHSA-x5rq-j2xg-h7qm');
      
      assert.strictEqual(result.id, 'GHSA-x5rq-j2xg-h7qm');
      assert.match(result.summary || '', /Prototype Pollution/);
    });
    
    it('should handle not found errors', async () => {
      nock('https://api.osv.dev')
        .get('/v1/vulns/INVALID-ID')
        .reply(404, { error: 'Not found' });
      
      await assert.rejects(
        async () => {
          await client.getVulnerability('INVALID-ID');
        },
        (error: Error) => {
          assert.match(error.message, /OSV vulnerability lookup failed/);
          return true;
        }
      );
    });
  });

  describe('analyzeDependencies', () => {
    it('should analyze dependencies and categorize vulnerabilities', async () => {
      const fixture = JSON.parse(
        await fs.readFile(
          path.join(__dirname, 'fixtures/osv/batch-response.json'),
          'utf-8'
        )
      );
      
      nock('https://api.osv.dev')
        .post('/v1/querybatch')
        .reply(200, fixture);
      
      const result = await client.analyzeDependencies([
        { name: 'lodash', version: '4.17.20', ecosystem: 'npm' },
        { name: 'express', version: '4.18.0', ecosystem: 'npm' },
      ]);
      
      assert.strictEqual(result.vulnerabilityIds.length, 1);
      assert.strictEqual(result.vulnerabilityIds[0], 'GHSA-x5rq-j2xg-h7qm');
      assert.strictEqual(result.vulnerabilities.high, 1);
      assert.strictEqual(result.vulnerabilities.critical, 0);
      assert.strictEqual(result.vulnerabilities.medium, 0);
      assert.strictEqual(result.vulnerabilities.low, 0);
    });
    
    it('should return empty results for packages with no vulnerabilities', async () => {
      const safeFixture = JSON.parse(
        await fs.readFile(
          path.join(__dirname, 'fixtures/osv/safe-package.json'),
          'utf-8'
        )
      );
      
      nock('https://api.osv.dev')
        .post('/v1/querybatch')
        .reply(200, { results: [safeFixture] });
      
      const result = await client.analyzeDependencies([
        { name: 'safe-package', version: '1.0.0', ecosystem: 'npm' },
      ]);
      
      assert.strictEqual(result.vulnerabilityIds.length, 0);
      assert.strictEqual(result.vulnerabilities.critical, 0);
      assert.strictEqual(result.vulnerabilities.high, 0);
      assert.strictEqual(result.vulnerabilities.medium, 0);
      assert.strictEqual(result.vulnerabilities.low, 0);
    });
    
    it('should properly categorize CVSS scores', async () => {
      const criticalVuln = {
        results: [
          {
            vulns: [
              {
                id: 'CRITICAL-1',
                severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H/10.0' }],
                affected: [{
                  package: { name: 'vuln-pkg', ecosystem: 'npm' },
                  ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '2.0.0' }] }],
                }],
              },
            ],
          },
        ],
      };
      
      nock('https://api.osv.dev')
        .post('/v1/querybatch')
        .reply(200, criticalVuln);
      
      const result = await client.analyzeDependencies([
        { name: 'vuln-pkg', version: '1.0.0', ecosystem: 'npm' },
      ]);
      
      assert.strictEqual(result.vulnerabilities.critical, 1);
    });
  });

  describe('version range checking', () => {
    it('should correctly identify affected versions', async () => {
      const vulnData = {
        results: [
          {
            vulns: [
              {
                id: 'TEST-VULN',
                affected: [
                  {
                    package: { name: 'test-pkg', ecosystem: 'npm' },
                    ranges: [
                      {
                        type: 'SEMVER',
                        events: [
                          { introduced: '1.0.0' },
                          { fixed: '1.5.0' },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      
      nock('https://api.osv.dev')
        .post('/v1/querybatch')
        .reply(200, vulnData);
      
      const result = await client.analyzeDependencies([
        { name: 'test-pkg', version: '1.3.0', ecosystem: 'npm' },
      ]);
      
      assert.strictEqual(result.vulnerabilityIds.length, 1);
    });
    
    it('should not flag fixed versions', async () => {
      const vulnData = {
        results: [
          {
            vulns: [
              {
                id: 'TEST-VULN',
                affected: [
                  {
                    package: { name: 'test-pkg', ecosystem: 'npm' },
                    ranges: [
                      {
                        type: 'SEMVER',
                        events: [
                          { introduced: '0' },
                          { fixed: '1.0.0' },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      
      nock('https://api.osv.dev')
        .post('/v1/querybatch')
        .reply(200, vulnData);
      
      const result = await client.analyzeDependencies([
        { name: 'test-pkg', version: '1.5.0', ecosystem: 'npm' },
      ]);
      
      assert.strictEqual(result.vulnerabilityIds.length, 0);
    });
  });
});
