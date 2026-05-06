import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PaymentsService } from './payments.service';
import type { PaymentMethodName } from './providers/types';

const SUPPORTED: PaymentMethodName[] = ['stripe', 'paystack', 'flutterwave'];

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /**
   * Lets the front end know which providers are configured server-side.
   * Optional `currency` query param returns the recommended default for
   * a tier in that currency, so the web app does not need to know the
   * regional preference rules.
   */
  @Get('methods')
  methods(@Query('currency') currency?: string) {
    return {
      methods: this.payments.listEnabledMethods(),
      recommended: currency ? this.payments.pickProviderForCurrency(currency) : null,
    };
  }

  /** Mints a checkout URL for the given pending order. */
  @Post('orders/:orderId/checkout')
  @HttpCode(201)
  startCheckout(@Param('orderId') orderId: string) {
    return this.payments.createCheckoutForOrder(orderId);
  }

  /**
   * Public read for the confirmation page. The order id is in the redirect
   * URL the provider sent the user back to, so we treat it as a soft-public
   * resource. No PII beyond what the user just supplied is exposed.
   */
  @Get('orders/:orderId')
  getOrder(@Param('orderId') orderId: string) {
    return this.payments.getOrderStatus(orderId);
  }
}

/**
 * Organizer-side payments management. Refunds and any future
 * provider-changing operations live here behind RolesGuard.
 */
@ApiTags('payments-organizer')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('organizations/:orgId/payments')
export class OrganizerPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('orders/:orderId/refund')
  @Roles('admin')
  refund(
    @Param('orgId') orgId: string,
    @Param('orderId') orderId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request & { id?: string },
  ) {
    return this.payments.refundOrder({
      orgId,
      orderId,
      actorUserId: user.userId,
      requestId: req.id,
    });
  }

  /**
   * Provider webhook endpoint. The raw request body is required for
   * signature verification, so the body parser is bypassed for this route in
   * `main.ts`. We pull `req.rawBody` out of the request object the JSON
   * parser left there.
   */
  @Post('webhook/:provider')
  @HttpCode(200)
  async webhook(
    @Param('provider') providerName: string,
    @Headers('stripe-signature') stripeSig: string | undefined,
    @Headers('x-paystack-signature') paystackSig: string | undefined,
    @Headers('verif-hash') flutterSig: string | undefined,
    @Req() req: Request & { rawBody?: Buffer },
  ) {
    const provider = providerName.toLowerCase() as PaymentMethodName;
    if (!SUPPORTED.includes(provider)) {
      throw new BadRequestException(`Unsupported provider: ${providerName}`);
    }
    const signature =
      provider === 'stripe' ? stripeSig : provider === 'paystack' ? paystackSig : flutterSig;
    if (!signature) {
      throw new UnauthorizedException('Missing signature header');
    }
    const body = req.rawBody;
    if (!body) {
      throw new BadRequestException('Webhook body was not captured raw; check main.ts rawBody flag');
    }
    return this.payments.handleWebhook(provider, body, signature);
  }
}
