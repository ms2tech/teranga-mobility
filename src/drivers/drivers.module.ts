import { Body, Controller, Get, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { DriverSummary, DriverWithVehicles } from '../common/safe-selects';
import { DriversService } from './drivers.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverStatusDto } from './dto/update-driver-status.dto';

@Controller('drivers')
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Get()
  findAll(@Query('assignable') assignable?: string): Promise<DriverWithVehicles[]> {
    return assignable === 'true'
      ? this.drivers.findAssignable()
      : this.drivers.findAll();
  }

  @Post()
  create(@Body() dto: CreateDriverDto): Promise<DriverWithVehicles> {
    return this.drivers.create(dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateDriverStatusDto,
  ): Promise<DriverSummary> {
    return this.drivers.updateStatus(id, dto.status);
  }
}

@Module({
  providers: [DriversService],
  controllers: [DriversController],
  exports: [DriversService],
})
export class DriversModule {}
