import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import assert from 'assert';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';

interface RdsStackProps extends cdk.StackProps {
  vpc: cdk.aws_ec2.IVpc;
  dbSg: cdk.aws_ec2.ISecurityGroup;
}

export class RdsStack extends cdk.Stack {
  public readonly secret: cdk.aws_secretsmanager.Secret;

  constructor(scope: Construct, id: string, props?: RdsStackProps) {
    super(scope, id, props);

    const appName = this.node.tryGetContext('appName');
    assert(appName, '');

    assert(props, '');

    const usePrivateSubnet = this.node.tryGetContext('usePrivateSubnet') !== false;

    const { dbSg, vpc } = props;

    const subnetGroup = new rds.SubnetGroup(this, 'SubnetGroup', {
      vpc,
      subnetGroupName: `${appName}-subnet-group`,
      description: 'for Mastra PgVector',
      vpcSubnets: {
        subnetType: usePrivateSubnet ? ec2.SubnetType.PRIVATE_ISOLATED : ec2.SubnetType.PUBLIC,
      },
    });

    const parameterGroup = new rds.ParameterGroup(this, 'ParameterGroup', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_6,
      }),
    });

    const secret = new cdk.aws_secretsmanager.Secret(this, 'DatabaseSecret', {
      secretName: `${appName}-database-credentials`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: 'postgres',
        }),
        generateStringKey: 'password',
        excludePunctuation: true,
        includeSpace: false,
      },
    });
    this.secret = secret;

    new rds.DatabaseCluster(this, 'Cluster', {
      clusterIdentifier: appName,
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_6,
      }),
      credentials: rds.Credentials.fromSecret(secret, 'postgres'),
      vpcSubnets: {
        subnetType: usePrivateSubnet ? ec2.SubnetType.PRIVATE_ISOLATED : ec2.SubnetType.PUBLIC,
      },
      vpc,
      writer: rds.ClusterInstance.serverlessV2('writer', {
        instanceIdentifier: `${appName}-writer`,
      }),
      serverlessV2MinCapacity: 0,
      serverlessV2MaxCapacity: 1,
      subnetGroup,
      parameterGroup,
      securityGroups: [dbSg],
    });
  }
}
