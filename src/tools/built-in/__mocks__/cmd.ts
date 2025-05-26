import { ToolBuilder } from '../../tool-builder';
import { z } from 'zod';

const cmdSchema = z.object({
  command: z.string().describe('Command to execute'),
  args: z.array(z.string()).optional().default([]).describe('Command arguments'),
  cwd: z.string().optional().describe('Working directory'),
  env: z.record(z.string()).optional().describe('Environment variables'),
  timeout: z.number().optional().default(30000).describe('Timeout in milliseconds'),
});

const DANGEROUS_COMMANDS = [
  'rm', 'sudo', 'chmod', 'chown', 'mkfs', 'dd', 'format',
  'shutdown', 'reboot', 'kill', 'pkill', 'systemctl',
];

// Mock implementation
export const cmd = new ToolBuilder()
  .name('cmd')
  .description('Execute shell commands')
  .parameters(cmdSchema)
  .execute(async (params) => {
    // Check for dangerous commands
    if (DANGEROUS_COMMANDS.includes(params.command) || 
        params.command.includes('|') || 
        params.command.includes(';') ||
        params.args.some((arg: string) => arg.includes('|') || arg.includes(';'))) {
      throw new Error('Command not allowed');
    }

    // Return mock result
    return {
      stdout: 'mock output',
      stderr: '',
      exitCode: 0,
      command: params.command,
      args: params.args,
    };
  })
  .build();