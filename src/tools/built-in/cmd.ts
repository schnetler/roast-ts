import { ToolBuilder } from '../tool-builder';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

const DANGEROUS_PATTERNS = [
  /\|.*sh$/, // Piping to shell
  /;\s*rm/, // Command chaining with rm
  /&&.*sudo/, // Command chaining with sudo
  />.*\/etc/, // Redirecting to system files
];

export const cmd = new ToolBuilder()
  .name('cmd')
  .description('Execute shell commands safely')
  .category('system')
  .parameters(cmdSchema)
  .execute(async (params, context) => {
    // Security checks
    if (DANGEROUS_COMMANDS.includes(params.command)) {
      throw new Error(`Command not allowed: ${params.command}`);
    }

    const fullCommand = params.args.length > 0 
      ? `${params.command} ${params.args.map((arg: string) => `"${arg.replace(/"/g, '\\"')}"`).join(' ')}`
      : params.command;
      
    if (DANGEROUS_PATTERNS.some(pattern => pattern.test(fullCommand))) {
      throw new Error('Command not allowed: potentially dangerous pattern detected');
    }

    try {
      const result = await execAsync(fullCommand, {
        cwd: params.cwd,
        env: params.env ? { ...process.env, ...params.env } : process.env,
        timeout: params.timeout,
      });

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: 0,
        command: params.command,
        args: params.args,
      };
    } catch (error: any) {
      if (error.signal === 'SIGTERM' || error.code === 'ABORT_ERR' || error.code === 'ETIMEDOUT') {
        return {
          stdout: error.stdout || '',
          stderr: error.stderr || '',
          exitCode: -1,
          command: params.command,
          args: params.args,
          timedOut: true,
        };
      }

      // Command executed but returned non-zero exit code
      if (error.code && typeof error.code === 'number') {
        return {
          stdout: error.stdout || '',
          stderr: error.stderr || '',
          exitCode: error.code,
          command: params.command,
          args: params.args,
        };
      }

      throw error;
    }
  })
  .retryable({ maxAttempts: 2, backoff: 'linear' })
  .build();