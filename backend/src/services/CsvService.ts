import { promises as fs } from 'fs';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import lockfile from 'proper-lockfile';
import { Customer, CustomerSchema } from '../models/Customer';
import { MeterReading, MeterReadingSchema } from '../models/MeterReading';
import { env } from '../config/env';
import { createLogger } from '../utils/logger';

const logger = createLogger({ service: 'CsvService' });

export class CsvService {
  private async readCsv<T>(
    filePath: string,
    schema: { parse: (data: unknown) => T }
  ): Promise<T[]> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      }) as unknown[];

      return records.map((record) => schema.parse(record));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.warn({ filePath }, 'CSV file not found, returning empty array');
        return [];
      }
      throw error;
    }
  }

  private async writeCsv<T extends Record<string, unknown>>(
    filePath: string,
    records: T[]
  ): Promise<void> {
    let release: (() => Promise<void>) | undefined;

    try {
      // Acquire lock
      release = await lockfile.lock(filePath, {
        retries: {
          retries: 5,
          minTimeout: 100,
          maxTimeout: env.CSV_LOCK_TIMEOUT
        },
        stale: env.CSV_LOCK_TIMEOUT
      });

      const csv = stringify(records, {
        header: true,
        columns: records.length > 0 ? Object.keys(records[0]) : undefined
      });

      await fs.writeFile(filePath, csv, 'utf-8');
      logger.debug({ filePath, recordCount: records.length }, 'CSV file written');
    } finally {
      if (release) {
        await release();
      }
    }
  }

  async getCustomers(): Promise<Customer[]> {
    return this.readCsv(env.CUSTOMERS_CSV_PATH, CustomerSchema);
  }

  async findCustomerByNumber(customerNumber: string): Promise<Customer | undefined> {
    const customers = await this.getCustomers();
    return customers.find((c) => c.customer_number === customerNumber);
  }

  async validateCustomerAndMeter(
    customerNumber: string,
    meterNumber: string
  ): Promise<boolean> {
    const customer = await this.findCustomerByNumber(customerNumber);
    if (!customer) {
      logger.debug({ customerNumber }, 'Customer not found');
      return false;
    }

    // Flexible matching: check if meter number contains the input or vice versa
    const csvMeter = customer.meter_number.toLowerCase().replace(/[^a-z0-9]/g, '');
    const inputMeter = meterNumber.toLowerCase().replace(/[^a-z0-9]/g, '');

    const isValid = csvMeter === inputMeter ||
                    csvMeter.includes(inputMeter) ||
                    inputMeter.includes(csvMeter);

    logger.debug({
      customerNumber,
      csvMeter: customer.meter_number,
      inputMeter: meterNumber,
      isValid
    }, 'Meter validation');

    return isValid;
  }

  async getMeterReadings(): Promise<MeterReading[]> {
    return this.readCsv(env.READINGS_CSV_PATH, MeterReadingSchema);
  }

  async saveMeterReading(reading: MeterReading): Promise<void> {
    const readings = await this.getMeterReadings();
    readings.push(reading);
    await this.writeCsv(env.READINGS_CSV_PATH, readings);
    logger.info(
      {
        customerNumber: reading.customer_number,
        meterNumber: reading.meter_number,
        callId: reading.call_id
      },
      'Meter reading saved'
    );
  }
}
