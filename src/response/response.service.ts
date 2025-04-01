import { Injectable, HttpStatus } from '@nestjs/common';

@Injectable()
export class ResponseService {
  successResponse(
    message: string,
    data?: any,
    pagination?: any,
  ) {
    return {
      status: true,
      message,
      data,
      pagination,
    };
  }

  errorResponse(message: string, statusCode?: number, errors?: any) {
    return {
      status: false,
      message,
      statusCode: statusCode || 400,
      errors,
    };
  }
}
