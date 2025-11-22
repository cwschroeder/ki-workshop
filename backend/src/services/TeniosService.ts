import { env } from '../config/env';
import { createLogger } from '../utils/logger';

const logger = createLogger({ service: 'TeniosService' });

interface SilentMonitoringResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export class TeniosService {
  private readonly apiKey: string;
  private readonly apiBaseUrl = 'https://api.tenios.com';

  constructor() {
    this.apiKey = env.TENIOS_API_KEY;
  }

  /**
   * Start Silent Monitoring on an active call
   * This connects a supervisor/transcription bot to listen to the call
   *
   * @param callUuid - The UUID of the active call to monitor
   * @param supervisorDestination - SIP URI of the monitoring endpoint (e.g., sip:cmschroeder@204671.tenios.com)
   * @param supervisorKey - Authentication key for the monitoring session
   */
  async startSilentMonitoring(
    callUuid: string,
    supervisorDestination: string,
    supervisorKey: string
  ): Promise<SilentMonitoringResponse> {
    try {
      logger.info(
        { callUuid, supervisorDestination },
        'Starting silent monitoring'
      );

      const response = await fetch(`${this.apiBaseUrl}/call/listen-in/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey
        },
        body: JSON.stringify({
          call_uuid: callUuid,
          supervisor_destination: supervisorDestination,
          supervisor_key: supervisorKey
        })
      });

      const data = await response.json() as { message?: string };

      if (!response.ok) {
        logger.error(
          { callUuid, status: response.status, data },
          'Failed to start silent monitoring'
        );
        return {
          success: false,
          error: data.message || 'Failed to start silent monitoring'
        };
      }

      logger.info({ callUuid, data }, 'Silent monitoring started successfully');

      return {
        success: true,
        message: 'Silent monitoring started'
      };
    } catch (error) {
      logger.error({ callUuid, error }, 'Error starting silent monitoring');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Stop Silent Monitoring on a call
   *
   * @param callUuid - The UUID of the call being monitored
   */
  async stopSilentMonitoring(callUuid: string): Promise<SilentMonitoringResponse> {
    try {
      logger.info({ callUuid }, 'Stopping silent monitoring');

      const response = await fetch(`${this.apiBaseUrl}/call/listen-in/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey
        },
        body: JSON.stringify({
          call_uuid: callUuid
        })
      });

      const data = await response.json() as { message?: string };

      if (!response.ok) {
        logger.error(
          { callUuid, status: response.status, data },
          'Failed to stop silent monitoring'
        );
        return {
          success: false,
          error: data.message || 'Failed to stop silent monitoring'
        };
      }

      logger.info({ callUuid }, 'Silent monitoring stopped successfully');

      return {
        success: true,
        message: 'Silent monitoring stopped'
      };
    } catch (error) {
      logger.error({ callUuid, error }, 'Error stopping silent monitoring');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
