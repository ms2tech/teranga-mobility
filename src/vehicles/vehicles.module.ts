import { Body, Controller, Get, Module, Post } from '@nestjs/common';
import { Vehicle } from '@prisma/client';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get()
  findAll() {
    return this.vehicles.findAll();
  }

  @Post()
  create(@Body() dto: CreateVehicleDto): Promise<Vehicle> {
    return this.vehicles.create(dto);
  }
}

@Module({
  providers: [VehiclesService],
  controllers: [VehiclesController],
  exports: [VehiclesService],
})
export class VehiclesModule {}
