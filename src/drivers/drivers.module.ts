import { Body, Controller, Get, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { Driver, DriverStatus } from '@prisma/client';
import { DriversService } from './drivers.service';
import { CreateDriverDto } from './dto/create-driver.dto';

@Controller('drivers')
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Get()
  findAll(@Query('assignable') assignable?: string): Promise<Driver[]> {
    return assignable === 'true'
      ? this.drivers.findAssignable()
      : this.drivers.findAll();
  }

  @Post()
  create(@Body() dto: CreateDriverDto): Promise<Driver> {
    return this.drivers.create(dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: DriverStatus },
  ): Promise<Driver> {
    return this.drivers.updateStatus(id, body.status);
  }
}

@Module({
  providers: [DriversService],
  controllers: [DriversController],
  exports: [DriversService],
})
export class DriversModule {}
